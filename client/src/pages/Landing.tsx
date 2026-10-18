import { Link } from 'react-router-dom';
import { PlatformWordmark, PlatformLogo } from '../components/brand';

const FEATURES: [string, string][] = [
  ['Cardápio digital e delivery', 'Link próprio da empresa, pedidos com taxa por bairro, acompanhamento pelo cliente e WhatsApp.'],
  ['Pedido na mesa pelo QR Code', 'O cliente lê o QR da mesa, escolhe, chama o garçom e pede a conta pelo celular.'],
  ['Cozinha, garçom e motoboy', 'Tela da cozinha por setor, app do garçom, área do entregador com rota e cobrança.'],
  ['PDV, caixa e financeiro', 'Vendas no balcão, pagamento dividido, sangria, fechamento, despesas e relatórios.'],
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-lenha-900 text-white">
      <div className="tech-grid">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <PlatformWordmark light size="sm" />
          <nav className="flex gap-2 text-sm font-semibold">
            <Link to="/entrar" className="rounded-xl bg-brasa-500 px-4 py-2.5 hover:bg-brasa-600">Acessar minha empresa</Link>
          </nav>
        </header>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-10 md:grid-cols-[1.2fr_1fr] md:pt-16">
          <div>
            <h1 className="font-slab text-4xl font-bold leading-[1.1] sm:text-5xl">Gestão completa para restaurantes, do pedido ao caixa.</h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">Uma plataforma para cada empresa operar com a própria marca: cardápio digital, mesas com QR Code, cozinha, delivery e financeiro — em tempo real, no celular ou no computador.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/entrar" className="inline-flex h-12 items-center rounded-xl bg-brasa-500 px-5 font-semibold hover:bg-brasa-600">Entrar como equipe</Link>
            </div>
          </div>
          <div className="relative mx-auto grid aspect-square w-full max-w-sm place-items-center">
            <div className="absolute inset-6 rounded-full bg-brasa-500/30 blur-3xl" aria-hidden />
            <PlatformLogo light className="relative w-3/4" />
          </div>
        </section>
      </div>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <span className="mb-4 block h-1 w-10 rounded-full bg-neon-400" aria-hidden />
            <h2 className="font-slab text-lg font-bold">{t}</h2>
            <p className="mt-2 text-sm text-white/65">{d}</p>
          </div>
        ))}
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-6 text-sm text-white/50">
        <span>© {new Date().getFullYear()} OITICICAS DIGITAL</span>
        <Link to="/plataforma" className="hover:text-white">Administração da plataforma</Link>
      </footer>
    </div>
  );
}
