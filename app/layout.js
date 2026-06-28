import './globals.css';

export const metadata = {
  title: 'PiscouLevou — Melhores Ofertas do Mercado Livre e Shopee',
  description:
    'As melhores ofertas do Mercado Livre e Shopee em um só lugar. Produtos com desconto real, atualização constante. Piscou, Levou!',
  keywords: 'ofertas, mercado livre, shopee, afiliados, desconto, mais vendidos, promoções, piscou levou',
  other: {
    'facebook-domain-verification': 'ym8c2du9dy2ejqjsw8biynpua9yoy4',
  },
  openGraph: {
    title: 'PiscouLevou — Ofertas Incríveis do Mercado Livre e Shopee',
    description:
      'Encontre os melhores descontos do Mercado Livre e da Shopee em tempo real. Piscou, Levou!',
    url: 'https://piscoulevou.com.br',
    siteName: 'PiscouLevou',
    locale: 'pt_BR',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// viewport e themeColor separados (Next.js 13.4+)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF6B00',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" />

        {/*
          Google Analytics 4 (G-Y4P75PZSVB) + Google Ads (AW-16853413769)
          Usando dangerouslySetInnerHTML para garantir que o script seja
          embutido diretamente no HTML estático (export da Hostinger).
          O strategy="afterInteractive" do Next.js Script não funciona
          em sites exportados como HTML estático.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-Y4P75PZSVB"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-Y4P75PZSVB');
              gtag('config', 'AW-16853413769');
            `,
          }}
        />
      </head>
      <body className="bg-[#F5F5F7] text-[#1D1D1F] min-h-screen">
        {children}
      </body>
    </html>
  );
}
