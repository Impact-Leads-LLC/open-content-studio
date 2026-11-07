import Nav from "./components/Nav";
import { BRAND, PALETTE } from "../lib/brand";

export const metadata = { title: BRAND };
const A = PALETTE.accent;

// Hover, focus and motion can't live in inline styles.
const CSS = `
*{box-sizing:border-box}
a,button,.tile,.card-h{transition:background .15s,color .15s,box-shadow .2s,transform .15s,border-color .15s}
button:disabled{opacity:.55;cursor:not-allowed}
button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid ${A};outline-offset:2px}
@keyframes pulse{0%{box-shadow:0 0 0 0 ${A}BF}100%{box-shadow:0 0 0 12px ${A}00}}
@keyframes flip{from{transform:rotateX(90deg);opacity:0}to{transform:none;opacity:1}}
@keyframes rise{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
.pulse{animation:pulse 1.4s ease-out 3}
.flip{display:inline-flex;animation:flip .25s ease-out}
.rise{animation:rise .32s cubic-bezier(.2,.8,.2,1)}
.tile:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(11,27,39,.14)}
.card-h:hover{box-shadow:0 12px 28px rgba(11,27,39,.10);transform:translateY(-1px)}
.drop{outline:2px dashed ${A};outline-offset:-4px;background:${A}1A!important}
.grid-queue{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:28px;align-items:start}
@media (max-width:960px){.grid-queue{grid-template-columns:1fr}}
.qcard{display:grid;grid-template-columns:136px minmax(0,1fr)}
@media (max-width:640px){.qcard{grid-template-columns:1fr}.qrail{flex-direction:row!important;align-items:center!important;flex-wrap:wrap}}
.listen{animation:pulse 1.2s ease-out infinite}
@media (max-width:560px){.two-up{grid-template-columns:1fr!important}}
.tline .tact{opacity:0;transition:opacity .15s}
.tline:hover .tact,.tline.cur .tact,.tline:focus-within .tact{opacity:1}
.tline:hover{background:#f4f6f8!important}
@media (hover:none){.tline .tact{opacity:1}}
details>summary{cursor:pointer}
@media (max-width:640px){.qtitle{display:none}.qbar{gap:10px!important;padding-left:16px!important;padding-right:16px!important;flex-wrap:nowrap!important}.qback{flex:1}.qok{flex:2;min-height:52px}}
/* phone: brand and Setup on one row, the three places on the next; New episode and Sign out move into Setup */
.tn-phone{display:none}
@media (max-width:640px){.topnav{padding:6px 16px!important;gap:0 8px!important;min-height:0!important}.tn-brand{flex:1;font-size:17px!important}.tn-setup{order:1;margin-left:0!important}.tn-setup .tn-menu{left:auto!important;right:0}.tn-right{display:none!important}.tn-links{order:2;width:100%;margin:0 -12px 2px;flex-wrap:nowrap!important}.tn-phone{display:block}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@600;700;800&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body style={{ margin: 0, background: "#f4f6f8", color: "#0c1a24", fontFamily: "Poppins, Arial, sans-serif" }}>
        <Nav />
        {children}
      </body>
    </html>
  );
}
