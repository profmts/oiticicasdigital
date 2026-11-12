// Módulo fiscal: configuração por empresa, montagem da NFC-e e comunicação com a API fiscal (Focus NFe).
// A emissão real exige conta na API fiscal + certificado digital da loja, feitos no ambiente de produção.
// Aqui montamos o pedido no formato da API, guardamos o resultado e expomos emitir/consultar/cancelar.
import type { DB, Q } from '../db.js';
import { bad, conflict, notFound, getSetting, setSetting, digits } from '../core.js';

export type FiscalConfig = {
  enabled: boolean;
  provider: 'focus';
  ambiente: 'homolog' | 'producao';
  cnpj: string;
  ie: string;
  regime: 'simples' | 'mei' | 'normal';
  csc: string;
  csc_id: string;
  token: string;
  auto_emit: boolean;
};

const DEFAULT_FISCAL: FiscalConfig = {
  enabled: false, provider: 'focus', ambiente: 'homolog', cnpj: '', ie: '', regime: 'simples',
  csc: '', csc_id: '', token: '', auto_emit: false,
};

/** Lê a configuração fiscal da empresa (guardada em settings.fiscal), com valores padrão. */
export async function readFiscal(q: Q, t: number): Promise<FiscalConfig> {
  const raw = (await getSetting<Partial<FiscalConfig>>(q, t, 'fiscal')) || {};
  return { ...DEFAULT_FISCAL, ...raw, cnpj: digits(String(raw.cnpj || '')) };
}

export async function saveFiscal(q: Q, t: number, cfg: Partial<FiscalConfig>) {
  const current = await readFiscal(q, t);
  const next: FiscalConfig = { ...current, ...cfg, cnpj: digits(String(cfg.cnpj ?? current.cnpj)).slice(0, 14) };
  await setSetting(q, t, 'fiscal', next);
  return next;
}

/** Mascara o token ao devolver a config para a tela (não expõe o segredo inteiro). */
export function maskFiscal(cfg: FiscalConfig) {
  const t = cfg.token || '';
  return { ...cfg, token: t ? `${t.slice(0, 4)}••••${t.slice(-4)}` : '', token_set: !!t };
}

const reais = (cents: number) => (Math.round(cents) / 100).toFixed(2);

// Situação tributária do ICMS conforme o regime. Simples usa CSOSN; o padrão cobre o caso comum de restaurante.
function icmsSituacao(regime: string, taxClass: string): string {
  if (regime === 'simples' || regime === 'mei') {
    if (taxClass === 'isento') return '400'; // não tributada pelo Simples
    return '102'; // tributada sem permissão de crédito
  }
  return taxClass === 'isento' ? '40' : '102';
}

// Código da forma de pagamento no padrão da NFC-e, a partir do nome da forma usada no pedido.
export function formaPagamento(nome: string): string {
  const n = (nome || '').toLowerCase();
  if (n.includes('dinheiro')) return '01';
  if (n.includes('pix')) return '17';
  if (n.includes('déb') || n.includes('deb')) return '04';
  if (n.includes('créd') || n.includes('cred') || n.includes('cartão') || n.includes('cartao')) return '03';
  if (n.includes('vale') || n.includes('ticket') || n.includes('alimenta')) return '10';
  return '99';
}

export type NfceItemInput = { name: string; qty: number; unit_price_cents: number; total_cents: number; ncm?: string | null; cfop?: string | null; origem?: string | null; tax_class?: string | null; product_id?: number | null };
export type NfceOrderInput = { id: number; number: number; total_cents: number; subtotal_cents: number; discount_cents: number; payments?: { method?: string; payment_method?: string; amount_cents: number }[] };

/** Monta o corpo da NFC-e no formato da API Focus NFe. Função pura (testável sem rede). */
export function buildNfcePayload(cfg: FiscalConfig, order: NfceOrderInput, items: NfceItemInput[], cpf?: string | null) {
  if (!items.length) throw bad('Pedido sem itens para a nota.');
  const cleanCpf = cpf ? digits(cpf).slice(0, 11) : '';
  const pagamentos = (order.payments && order.payments.length)
    ? order.payments.map((p) => ({ forma_pagamento: formaPagamento(p.method || p.payment_method || ''), valor_pagamento: reais(p.amount_cents) }))
    : [{ forma_pagamento: '99', valor_pagamento: reais(order.total_cents) }];
  return {
    cnpj_emitente: cfg.cnpj,
    natureza_operacao: 'Venda ao consumidor',
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    consumidor_final: 1,
    ...(cleanCpf.length === 11 ? { cpf_destinatario: cleanCpf } : {}),
    valor_produtos: reais(order.subtotal_cents),
    valor_desconto: reais(order.discount_cents || 0),
    valor_total: reais(order.total_cents),
    formas_pagamento: pagamentos,
    items: items.map((it, i) => ({
      numero_item: i + 1,
      codigo_produto: String(it.product_id || i + 1),
      descricao: it.name,
      codigo_ncm: (it.ncm && digits(it.ncm)) || '21069090',
      cfop: it.cfop || '5102',
      unidade_comercial: 'UN',
      unidade_tributavel: 'UN',
      quantidade_comercial: String(it.qty),
      quantidade_tributavel: String(it.qty),
      valor_unitario_comercial: reais(it.unit_price_cents),
      valor_unitario_tributavel: reais(it.unit_price_cents),
      valor_bruto: reais(it.total_cents),
      icms_origem: it.origem || '0',
      icms_situacao_tributaria: icmsSituacao(cfg.regime, it.tax_class || 'normal'),
      pis_situacao_tributaria: '49',
      cofins_situacao_tributaria: '49',
    })),
  };
}

function baseUrl(cfg: FiscalConfig) {
  return cfg.ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
}

async function focus(cfg: FiscalConfig, method: string, pathQ: string, body?: unknown): Promise<{ httpStatus: number; data: any }> {
  if (!cfg.token) throw bad('Configure o token da API fiscal antes de emitir.');
  const auth = Buffer.from(`${cfg.token}:`).toString('base64');
  const res = await fetch(`${baseUrl(cfg)}${pathQ}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { httpStatus: res.status, data };
}

// Traduz a resposta da Focus para o nosso status interno.
function mapStatus(data: any): { status: string; message?: string } {
  const s = data?.status;
  if (s === 'autorizado') return { status: 'autorizada' };
  if (s === 'cancelado') return { status: 'cancelada' };
  if (s === 'erro_autorizacao' || s === 'denegado') return { status: 'rejeitada', message: data?.mensagem_sefaz || data?.mensagem };
  if (s === 'processando_autorizacao') return { status: 'processando' };
  return { status: 'erro', message: data?.mensagem || data?.erros?.[0]?.mensagem };
}

async function applyResult(db: DB, t: number, ref: string, r: { httpStatus: number; data: any }) {
  const m = mapStatus(r.data);
  const d = r.data || {};
  await db.run(
    `UPDATE nfce SET status=$1, numero=$2, serie=$3, chave=$4, protocolo=$5, danfe_url=$6, xml_url=$7, qrcode_url=$8, message=$9, updated_at=NOW(3) WHERE tenant_id=$10 AND ref=$11`,
    [m.status, d.numero ?? null, d.serie ?? null, d.chave_nfe || d.chave || null, d.protocolo || null,
     d.caminho_danfe ? baseUrlFromPath(d.caminho_danfe) : (d.url_danfe || null), d.caminho_xml_nota_fiscal ? baseUrlFromPath(d.caminho_xml_nota_fiscal) : (d.url_xml || null),
     d.qrcode || null, (m.message || '').slice(0, 600) || null, t, ref],
  );
  return db.get('SELECT * FROM nfce WHERE tenant_id=$1 AND ref=$2', [t, ref]);
}
function baseUrlFromPath(p: string) { return p.startsWith('http') ? p : `https://api.focusnfe.com.br${p}`; }

export async function latestNfce(q: Q, t: number, orderId: number) {
  return q.get('SELECT * FROM nfce WHERE tenant_id=$1 AND order_id=$2 ORDER BY id DESC LIMIT 1', [t, orderId]);
}

/** Emite a NFC-e de um pedido: registra a nota como pendente, chama a API e grava o resultado. */
export async function emitNfce(db: DB, t: number, order: NfceOrderInput, items: NfceItemInput[], cpf: string | null) {
  const cfg = await readFiscal(db, t);
  if (!cfg.enabled) throw conflict('A emissão de nota fiscal está desligada para esta loja.');
  const existing = await latestNfce(db, t, order.id);
  if (existing && (existing.status === 'autorizada' || existing.status === 'processando')) {
    throw conflict('Este pedido já tem nota emitida.');
  }
  const ref = `${t}-${order.id}-${Date.now().toString(36)}`;
  const cleanCpf = cpf ? digits(cpf).slice(0, 11) : null;
  await db.run(
    'INSERT INTO nfce (tenant_id, order_id, ref, ambiente, status, cpf, total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [t, order.id, ref, cfg.ambiente, 'pendente', cleanCpf, order.total_cents],
  );
  const payload = buildNfcePayload(cfg, order, items, cleanCpf);
  const r = await focus(cfg, 'POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, payload);
  return applyResult(db, t, ref, r);
}

/** Consulta de novo o status de uma nota na SEFAZ (para notas que ficaram processando). */
export async function refreshNfce(db: DB, t: number, orderId: number) {
  const cfg = await readFiscal(db, t);
  const row = await latestNfce(db, t, orderId);
  if (!row) throw notFound('Nenhuma nota para este pedido.');
  const r = await focus(cfg, 'GET', `/v2/nfce/${encodeURIComponent(row.ref)}?completa=1`);
  return applyResult(db, t, row.ref, r);
}

/** Cancela a NFC-e autorizada de um pedido, dentro do prazo legal, com justificativa. */
export async function cancelNfce(db: DB, t: number, orderId: number, justificativa: string) {
  const cfg = await readFiscal(db, t);
  const row = await latestNfce(db, t, orderId);
  if (!row) throw notFound('Nenhuma nota para este pedido.');
  if (row.status !== 'autorizada') throw conflict('Só é possível cancelar uma nota autorizada.');
  if (!justificativa || justificativa.trim().length < 15) throw bad('A justificativa do cancelamento deve ter pelo menos 15 caracteres.');
  const r = await focus(cfg, 'DELETE', `/v2/nfce/${encodeURIComponent(row.ref)}`, { justificativa: justificativa.trim() });
  return applyResult(db, t, row.ref, r);
}
