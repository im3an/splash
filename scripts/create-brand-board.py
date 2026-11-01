from pathlib import Path
from html import escape
import re
root=Path(__file__).resolve().parent.parent
out=root/'assets/brand'
master=(out/'mark.svg').read_text(); d=master[master.index('>')+1:master.rindex('</svg>')]
ink='#221d17'; paper='#f3efe9'; surface='#faf8f5'; accent='#b4542d'; muted='#655c52'; dark='#1a1714'
font="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif"
def text(x,y,t,size=16,fill=ink,weight=400,spacing=0):
 return f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" letter-spacing="{spacing}" fill="{fill}">{escape(t)}</text>'
def rect(x,y,w,h,c,rx=0): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{c}"/>'
def mark(x,y,size,c=ink): return f'<g transform="translate({x} {y}) scale({size/32})">{d.replace(ink,c)}</g>'
def lockup(x,y,size=64,c=ink): return mark(x,y,size,c)+text(x+size+size/3,y+size*.77,'Splash',size*.9,c,600,-size*.9*.025)
def label(x,y,n,t): return text(x,y,n,12,accent,600,1.2)+text(x+32,y,t.upper(),12,muted,500,1.5)
def line(y): return f'<path d="M64 {y}H1536" stroke="#d8d1c8"/>'
parts=[rect(0,0,1600,1960,paper), text(64,70,'SPLASH / IDENTITY SYSTEM',13,muted,500,2),text(1536,70,'01',13,muted,500),line(96)]
parts += [lockup(88,170,180),text(1000,205,'A trail-based browser',30,ink,500,-.5),text(1000,245,'for macOS.',30,ink,500,-.5),text(1000,300,'A drop, and the ripple it leaves.',16,muted),text(1000,328,'Every trail starts with one page.',16,muted),line(428)]
parts += [label(64,472,'01','Signature'),rect(64,500,720,260,surface,16),lockup(235,587,72),rect(808,500,728,260,dark,16),lockup(983,587,72,surface),text(88,738,'PRIMARY / INK ON PAPER',11,muted,500,1.1),text(832,738,'REVERSED / PAPER ON CHARCOAL',11,'#a2a2a8',500,1.1)]
parts += [label(64,814,'02','Logo family'),rect(64,840,472,260,surface,16),mark(244,894,112),text(88,1076,'MONOCHROME',11,muted,500,1.1),rect(560,840,472,260,'#e9e1d7',16),mark(740,894,112,accent),text(584,1076,'TERRACOTTA',11,muted,500,1.1),rect(1056,840,480,260,surface,16)]
# Native icon rendered directly from its vector master.
app=(out/'app-icon.svg').read_text(); body=app[app.index('>')+1:app.rindex('</svg>')]
parts += [f'<g transform="translate(1190 858) scale({212/1024})">{body}</g>',text(1080,1076,'MACOS APPLICATION ICON',11,muted,500,1.1)]
parts += [label(64,1154,'03','Color palette')]
colors=[('Paper',paper,'#F3EFE9'),('Surface',surface,'#FAF8F5'),('Ink',ink,'#221D17'),('Charcoal',dark,'#1A1714'),('Terracotta',accent,'#B4542D')]
for i,(name,c,h) in enumerate(colors):
 x=64+i*299
 parts += [rect(x,1180,276,104,c,10),f'<rect x="{x}" y="1180" width="276" height="104" rx="10" fill="none" stroke="#d8d1c8" stroke-width="1"/>',text(x,1315,name,18,ink,500),text(x,1342,h,13,muted,400,1)]
parts += [line(1380),label(64,1426,'04','Typography'),text(64,1492,'Splash',52,ink,600,-1.3),text(64,1530,'System sans / Semibold / −0.025em tracking',15,muted),text(64,1578,'Browse with a sense of direction.',25,ink,500,-.4),text(64,1614,'Workspaces, trails, branches and pages.',17,muted),label(880,1426,'05','Small-size recognition')]
for x,s in [(888,16),(976,24),(1080,32),(1200,48),(1344,64)]:
 parts += [mark(x,1490+(64-s)/2,s),text(x,1590,f'{s}px',13,muted)]
parts += [text(880,1630,'Use the mark alone at 16px. Keep the ripple’s gap.',15,muted),line(1680),label(64,1726,'06','Construction & use')]
# clearspace diagram at lower left
parts += [f'<rect x="64" y="1760" width="128" height="128" fill="none" stroke="#b4542d" stroke-dasharray="4 4"/>',mark(84,1780,88),text(224,1790,'Give the mark room.',20,ink,500),text(224,1820,'Minimum clear space: one ripple width.',15,muted),text(224,1846,'Preserve proportions and original geometry.',15,muted),text(880,1790,'Quiet by design.',20,ink,500),text(880,1820,'Flat color. Crisp silhouettes. No ornamental effects.',15,muted),text(880,1846,'Accent for identity; monochrome within browser chrome.',15,muted),text(64,1928,'SPLASH',11,muted,600,1.5),text(1170,1928,'BRAND BOARD / NOVEMBER 2026',11,muted,500,1)]
svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1960" viewBox="0 0 1600 1960">'+''.join(parts)+'</svg>'
(out/'splash-brand-board.svg').write_text(svg)
for name,c in [('primary',ink),('accent',accent),('reversed',surface)]:
 (out/f'wordmark-{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80">{lockup(0,8,64,c)}</svg>')
