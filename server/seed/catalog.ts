import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Q, DB } from '../db.js';
import { config } from '../config.js';
import { randomToken } from '../core.js';

/**
 * Cardápio inicial do Espetinho do Sergio, transcrito do cardápio oficial.
 * Somente produtos e preços que constam no cardápio — nada de estoque, taxas ou tamanhos inventados.
 */
type V = [string, number];
type P = { name: string; variants?: V[]; price?: number; description?: string };
type C = { name: string; sector: string; products: P[] };

const ESPETOS: P[] = [
  { name: 'Carne', price: 10 }, { name: 'Porco', price: 10 }, { name: 'Frango', price: 10 }, { name: 'Calabresa', price: 10 },
  { name: 'Queijo', price: 10 }, { name: 'Frango c/ bacon', price: 10 }, { name: 'Carne de sol c/ queijo', price: 12 },
  { name: 'Carne moída c/ bacon', price: 10 }, { name: 'Coração de frango', price: 10 }, { name: 'Ovo de codorna c/ bacon', price: 10 },
];

export const ESPETINHO_CATALOG: C[] = [
  { name: 'Espetos', sector: 'espetos', products: ESPETOS.map((p) => ({ ...p, name: `Espeto de ${p.name.charAt(0).toLowerCase()}${p.name.slice(1)}` })) },
  { name: 'Combos', sector: 'porcoes', products: [{ name: 'Combo (porção individual)', description: 'Baião solto ou mexido + arroz de leite, farofa, vinagrete e macaxeira e qualquer espeto.', variants: [['Pra viagem', 20], ['Pra comer no estabelecimento', 15]] }] },
  {
    name: 'Porções', sector: 'porcoes', products: [
      { name: 'Arroz de leite', variants: [['Pequena', 12], ['Grande', 15]] }, { name: 'Baião solto', variants: [['Pequena', 12], ['Grande', 15]] },
      { name: 'Baião de leite', variants: [['Pequena', 12], ['Grande', 15]] }, { name: 'Creme de galinha', variants: [['Pequena', 13], ['Grande', 18]] },
      { name: 'Munguzá', variants: [['Pequena', 13], ['Grande', 18]] }, { name: 'Fava', variants: [['Pequena', 13], ['Grande', 18]] },
      { name: 'Creme de macaxeira', price: 20 }, { name: 'Macaxeira c/ manteiga', price: 12 }, { name: 'Macaxeira frita', price: 15 },
      { name: 'Batata frita', price: 18 }, { name: 'Torresmo', price: 7 },
    ],
  },
  { name: 'Cervejas', sector: 'bebidas', products: ['Litrinho', 'Skol', 'Brahma', 'Devassa', 'Itaipava', 'Petra'].map((name) => ({ name, price: 5 })) },
  { name: 'Long neck', sector: 'bebidas', products: [{ name: 'Stella', price: 10 }, { name: 'Cabaré Ice', price: 12 }, { name: 'Spaten', price: 10 }, { name: 'Heineken', price: 12 }, { name: 'Budweiser', price: 10 }] },
  { name: 'Sucos naturais', sector: 'bebidas', products: [{ name: 'Suco de acerola', price: 6 }, { name: 'Suco de tamarindo', price: 6 }, { name: 'Suco de goiaba', price: 6 }, { name: 'Suco de caju', price: 6 }, { name: 'Suco de uva', price: 6 }, { name: 'Jarra de suco 1L', price: 20 }] },
  {
    name: 'Refrigerantes e águas', sector: 'bebidas', products: [
      { name: 'Coca-Cola lata 350ml', price: 6 }, { name: 'Coca-Cola Zero lata 350ml', price: 6 }, { name: 'Guaraná lata 350ml', price: 6 }, { name: 'Sprite lata 350ml', price: 6 },
      { name: 'Fanta Laranja lata 350ml', price: 6 }, { name: 'Fanta Uva lata 350ml', price: 6 }, { name: 'Coca-Cola 1L', price: 11 }, { name: 'Guaraná 1L', price: 11 },
      { name: 'Coca-Cola Zero 1L', price: 11 }, { name: 'Fanta 1L', price: 11 }, { name: 'Cajuína 1L', price: 11 }, { name: 'Coca-Cola 600ml', price: 8 },
      { name: 'Coca-Cola Zero 600ml', price: 8 }, { name: 'H2O', price: 8 }, { name: 'Água Fresh', price: 3 }, { name: 'Água mineral sem gás', price: 3 }, { name: 'Água mineral com gás', price: 4 },
    ],
  },
];

export async function seedCatalog(q: Q, tenantId: number, catalog: C[]) {
  for (const [ci, c] of catalog.entries()) {
    const cid = (await q.get('INSERT INTO categories (tenant_id, name, sector, sort) VALUES ($1,$2,$3,$4) RETURNING id', [tenantId, c.name, c.sector, ci])).id;
    for (const [pi, p] of c.products.entries()) {
      const isCombo = c.name === 'Combos';
      const pid = (await q.get('INSERT INTO products (tenant_id, category_id, name, description, sort, featured) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [tenantId, cid, p.name, p.description || '', pi, isCombo])).id;
      const variants: V[] = p.variants || [['Único', p.price!]];
      for (const [vi, [vn, price]] of variants.entries()) {
        // Combo: "pra viagem" vale para delivery/retirada/balcão; "no estabelecimento" para mesa/balcão
        const ot = isCombo ? (vn === 'Pra viagem' ? 'delivery,retirada,balcao' : 'mesa,balcao') : null;
        await q.run('INSERT INTO product_variants (tenant_id, product_id, name, price_cents, sort, order_types) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, pid, vn, Math.round(price * 100), vi, ot]);
      }
      if (isCombo) {
        const g1 = (await q.get('INSERT INTO option_groups (tenant_id, product_id, name, min_select, max_select, sort) VALUES ($1,$2,$3,1,1,0) RETURNING id', [tenantId, pid, 'Baião'])).id;
        await q.run("INSERT INTO options (tenant_id, group_id, name, sort) VALUES ($1,$2,'Baião solto',0), ($1,$2,'Baião mexido',1)", [tenantId, g1]);
        const g2 = (await q.get('INSERT INTO option_groups (tenant_id, product_id, name, min_select, max_select, sort) VALUES ($1,$2,$3,1,1,1) RETURNING id', [tenantId, pid, 'Espeto do combo'])).id;
        for (const [i, e] of ESPETOS.entries()) await q.run('INSERT INTO options (tenant_id, group_id, name, sort) VALUES ($1,$2,$3,$4)', [tenantId, g2, e.name, i]);
      }
    }
  }
}

/** Configurações padrão de qualquer empresa nova. */
export function defaultSettings(name: string): Record<string, unknown> {
  return {
    store_name: name, slogan: '', whatsapp: '', whatsapp_display: '', address: '', city: '', instagram: '',
    is_open: false, closed_message: 'Estamos fechados no momento. Volte mais tarde!',
    accept_delivery: true, accept_pickup: true, min_order_cents: 0,
    delivery_estimate_minutes: null, pickup_estimate_minutes: null, allow_unlisted_neighborhood: true, prep_alert_minutes: 25,
    payment_methods: [
      { id: 'dinheiro', name: 'Dinheiro', active: true, online: true }, { id: 'pix', name: 'Pix', active: true, online: true },
      { id: 'debito', name: 'Cartão de débito', active: true, online: true }, { id: 'credito', name: 'Cartão de crédito', active: true, online: true },
    ],
    pix_key: '', banners: [], kitchen_sectors: ['cozinha', 'bebidas'], timezone: 'America/Fortaleza',
    // Pedido presencial pelo QR Code
    self_order_enabled: true,          // QR das mesas aceita pedidos
    self_order_auto_kitchen: false,    // false = garçom/caixa confirma antes de ir para a cozinha
    self_order_counter_enabled: false, // QR do balcão (sem mesa): desligado por padrão; a empresa liga se quiser
    hide_table_13: false,              // ocultar a mesa de número 13 (superstição), opção do administrador
    team_pin: '',                      // PIN da loja para a tela de acesso por perfil; vazio = login digitado tradicional
    // Identidade visual do cardápio
    brand_color: '#2563eb', brand_dark: '#0f172a', menu_font: 'modern',
  };
}

export const ESPETINHO_SETTINGS: Record<string, unknown> = {
  store_name: 'Espetinho do Sergio', slogan: 'O melhor espetinho da cidade!',
  whatsapp: '5583998361492', whatsapp_display: '(83) 99836-1492',
  address: 'Praça dos Trabalhadores, próximo ao Círculo Operário, Travessa São Francisco, Centro, Cajazeiras – PB, CEP 58900-000',
  city: 'Cajazeiras - PB',
  banners: [
    { title: 'Espetos a partir de R$ 10', subtitle: 'Carne, frango, porco, calabresa, queijo e muito mais', category: 'Espetos' },
    { title: 'Combo completo', subtitle: 'Baião + arroz de leite, farofa, vinagrete, macaxeira e qualquer espeto', category: 'Combos' },
    { title: 'Gelada do seu jeito', subtitle: 'Cervejas, long necks, sucos naturais e refrigerantes', category: 'Cervejas' },
  ],
  kitchen_sectors: ['espetos', 'porcoes', 'bebidas'],
  brand_color: '#f07a1a', brand_dark: '#2b1a10', menu_font: 'slab',
};

export async function applySettings(q: Q, tenantId: number, s: Record<string, unknown>) {
  for (const [k, v] of Object.entries(s)) {
    await q.run('INSERT INTO settings (tenant_id, `key`, value) VALUES ($1,$2,$3) ON DUPLICATE KEY UPDATE value = VALUES(value)', [tenantId, k, JSON.stringify(v)]);
  }
}

/** Garante que toda empresa tenha todas as chaves de configuração (novas chaves em versões futuras). */
export async function ensureSettings(q: Q, tenantId: number, name: string) {
  for (const [k, v] of Object.entries(defaultSettings(name))) {
    await q.run('INSERT IGNORE INTO settings (tenant_id, `key`, value) VALUES ($1,$2,$3)', [tenantId, k, JSON.stringify(v)]);
  }
}

export async function createTenant(q: Q, t: { slug: string; name: string; plan_id?: number | null; status?: string; trial_ends_at?: string | null; document?: string; contact_name?: string; contact_phone?: string; contact_email?: string }) {
  const row = await q.get(`INSERT INTO tenants (slug, name, plan_id, status, trial_ends_at, document, contact_name, contact_phone, contact_email)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
  [t.slug, t.name, t.plan_id ?? null, t.status || 'ativo', t.trial_ends_at ?? null, t.document || '', t.contact_name || '', t.contact_phone || '', t.contact_email || '']);
  await applySettings(q, row.id, defaultSettings(t.name));
  return row.id as number;
}

export const newTableToken = () => randomToken(12);

/** Primeira execução: plano inicial e a empresa Espetinho do Sergio com o cardápio e as configurações atuais. */
export async function seedPlatform(db: DB) {
  await db.tx(async (q) => {
    if (!(await q.get('SELECT 1 FROM plans LIMIT 1'))) {
      await q.run(`INSERT INTO plans (name, description, price_cents) VALUES ('Plano inicial', 'Todos os recursos, sem limites. Defina preços e limites quando lançar os planos.', NULL)`);
    }
    if (config.seedEspetinho && !(await q.get("SELECT 1 FROM tenants WHERE slug = 'espetinho-do-sergio'"))) {
      const plan = await q.get('SELECT id FROM plans ORDER BY id LIMIT 1');
      const id = await createTenant(q, { slug: 'espetinho-do-sergio', name: 'Espetinho do Sergio', plan_id: plan.id, contact_phone: '83998361492' });
      await applySettings(q, id, ESPETINHO_SETTINGS);
      await seedCatalog(q, id, ESPETINHO_CATALOG);
      const here = path.dirname(fileURLToPath(import.meta.url));
      const logo = [path.join(here, 'assets', 'espetinho-logo.jpeg'), path.join(here, '..', 'server', 'seed', 'assets', 'espetinho-logo.jpeg'), path.join(config.appRoot, 'server', 'seed', 'assets', 'espetinho-logo.jpeg')].find((f) => fs.existsSync(f)) || '';
      if (logo) {
        const data = fs.readFileSync(logo);
        const f = await q.get('INSERT INTO files (tenant_id, mime, size, data) VALUES ($1, $2, $3, $4) RETURNING id', [id, 'image/jpeg', data.length, data]);
        await q.run('UPDATE tenants SET logo_file_id = $1 WHERE id = $2', [f.id, id]);
      }
      console.log('[seed] empresa Espetinho do Sergio criada com o cardápio oficial');
    }
  });
  for (const t of await db.all('SELECT id, name FROM tenants')) await ensureSettings(db, t.id, t.name);
}
