import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { setAuthAsker, ApiError } from '../lib/api';
import { maskCents, maskPhone, maskCpf } from '../lib/format';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'dark' | 'ghost' | 'danger' | 'success' | 'outline';
const V: Record<Variant, string> = {
  primary: 'bg-brasa-500 text-white hover:bg-brasa-600 active:bg-brasa-700 shadow-sm',
  dark: 'bg-lenha-900 text-white hover:bg-lenha-800',
  ghost: 'bg-transparent text-lenha-700 hover:bg-lenha-100',
  outline: 'bg-white text-lenha-900 border border-lenha-200 hover:border-lenha-300 hover:bg-lenha-50',
  danger: 'bg-alerta text-white hover:brightness-110',
  success: 'bg-ok text-white hover:brightness-110',
};
export function Button({ variant = 'primary', size = 'md', busy, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const s = size === 'sm' ? 'h-9 px-3 text-sm' : size === 'lg' ? 'h-14 px-6 text-lg' : 'h-11 px-4';
  return (
    <button {...p} disabled={p.disabled || busy}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 select-none', s, V[variant], className)}>
      {busy && <span className="size-4 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold text-lenha-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-lenha-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-semibold text-alerta">{error}</span>}
    </label>
  );
}
const inputCls = 'w-full rounded-xl border border-lenha-200 bg-white px-3 h-11 text-base text-lenha-900 placeholder:text-lenha-300 focus:border-brasa-500 focus:outline-none focus:ring-2 focus:ring-brasa-200';
// larguras explícitas (w-40, w-auto...) substituem o w-full padrão
const withWidth = (className?: string) => (/(^|\s)w-/.test(className || '') ? inputCls.replace('w-full ', '') : inputCls);
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(withWidth(className), className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(withWidth(className), 'pr-8', className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'h-auto py-2 min-h-20', className)} />;

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-3 select-none', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-lenha-200')}>
        <span className={cx('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
      <span className="text-sm">{label}</span>
    </label>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brasa' | 'ok' | 'alerta' | 'ouro' | 'dark'; children: ReactNode; className?: string }) {
  const t = { neutral: 'bg-lenha-100 text-lenha-700', brasa: 'bg-brasa-100 text-brasa-700', ok: 'bg-green-100 text-green-800', alerta: 'bg-red-100 text-red-800', ouro: 'bg-ouro-300/60 text-lenha-900', dark: 'bg-lenha-900 text-white' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', t, className)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide, side }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; side?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button[data-autofocus]')?.focus(), 30);
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-50 flex bg-lenha-900/50', side ? 'justify-end' : 'items-end sm:items-center justify-center sm:p-4')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true"
        className={cx('flex max-h-[100dvh] w-full flex-col bg-papel shadow-2xl',
          side ? 'h-full max-w-xl' : cx('max-h-[92dvh] rounded-t-3xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'))}>
        <div className="flex items-center justify-between gap-3 border-b border-lenha-100 px-5 py-4">
          <h2 className="font-slab text-xl font-bold leading-tight">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-2xl leading-none text-lenha-500 hover:bg-lenha-100" aria-label="Fechar">×</button>
        </div>
        <div className="scroll-visible flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-lenha-100 px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-lenha-200 bg-white/60 px-6 py-10 text-center">
      <p className="font-slab text-lg font-bold text-lenha-700">{title}</p>
      {children && <div className="mt-1 text-sm text-lenha-500">{children}</div>}
    </div>
  );
}
export const Spinner = ({ label = 'Carregando…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-lenha-500"><span className="size-5 rounded-full border-2 border-brasa-500 border-r-transparent animate-spin" />{label}</div>
);
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{msg} {retry && <button className="ml-2 font-semibold underline" onClick={retry}>Tentar de novo</button>}</div>
);

// ------------- Toasts -------------
type Toast = { id: number; msg: string; tone: 'ok' | 'erro' | 'info' };
const ToastCtx = createContext<(msg: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

// ------------- Autorização de supervisor -------------
export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'erro' ? 6000 : 3200);
  }, []);
  const [authReq, setAuthReq] = useState<{ perm: string; resolve: (v: any) => void } | null>(null);
  const [u, setU] = useState(''); const [pw, setPw] = useState('');
  useEffect(() => { setAuthAsker((perm) => new Promise((resolve) => { setU(''); setPw(''); setAuthReq({ perm, resolve }); })); }, []);
  const close = (v: any) => { authReq?.resolve(v); setAuthReq(null); };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg', t.tone === 'erro' ? 'bg-alerta' : t.tone === 'info' ? 'bg-lenha-800' : 'bg-ok')}>{t.msg}</div>
        ))}
      </div>
      <Modal open={!!authReq} onClose={() => close(null)} title="Autorização do supervisor"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => close(null)}>Cancelar</Button><Button className="flex-1" onClick={() => close({ username: u, password: pw })} disabled={!u || !pw}>Autorizar</Button></div>}>
        <p className="mb-4 text-sm text-lenha-700">Esta ação precisa da senha de alguém com permissão. O nome de quem autorizou fica registrado na auditoria.</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (u && pw) close({ username: u, password: pw }); }}>
          <Field label="Usuário do supervisor"><Input value={u} onChange={(e) => setU(e.target.value)} autoComplete="off" autoCapitalize="none" /></Field>
          <Field label="Senha"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></Field>
          <button type="submit" hidden />
        </form>
      </Modal>
    </ToastCtx.Provider>
  );
}

/** Executa uma ação mostrando toast de erro/sucesso. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(key);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e: any) { if (!(e instanceof ApiError && e.status === 0)) toast(e.message || 'Erro', 'erro'); return undefined; }
    finally { setBusy(null); }
  }, [toast]);
  return { busy, run };
}

export function MoneyInput({ value, onChange, ...p }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  // Máscara de centavos: digita só números e o valor se forma da direita (centavos, reais, milhares).
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lenha-500">R$</span>
      <Input inputMode="numeric" {...p} value={value} onChange={(e) => onChange(maskCents(e.target.value))} className={cx('pl-10 tabnums', p.className)} />
    </div>
  );
}

/** Campo de telefone com máscara (83) 99999-9999 enquanto digita. O valor guardado é o texto com máscara. */
export function PhoneInput({ value, onChange, ...p }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input inputMode="tel" autoComplete="tel" placeholder="(83) 99999-9999" {...p} value={value} onChange={(e) => onChange(maskPhone(e.target.value))} />;
}

/** Campo de CPF com máscara 000.000.000-00 enquanto digita. */
export function CpfInput({ value, onChange, ...p }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input inputMode="numeric" placeholder="000.000.000-00" {...p} value={value} onChange={(e) => onChange(maskCpf(e.target.value))} />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brasa' | 'dark' }) {
  return (
    <div className={cx('rounded-2xl p-4', tone === 'dark' ? 'bg-lenha-900 text-white' : tone === 'brasa' ? 'bg-brasa-500 text-white' : 'bg-white border border-lenha-100')}>
      <div className={cx('text-sm', tone ? 'text-white/80' : 'text-lenha-500')}>{label}</div>
      <div className="mt-1 font-cond text-3xl font-bold tabnums leading-none">{value}</div>
      {sub && <div className={cx('mt-2 text-xs', tone ? 'text-white/75' : 'text-lenha-500')}>{sub}</div>}
    </div>
  );
}
