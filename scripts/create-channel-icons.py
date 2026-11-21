import sys, subprocess
out, cells_s = sys.argv[1], sys.argv[2]
D='M16 3.5c-1.6 2-6.75 8.4-6.75 12.6a6.75 6.75 0 0 0 13.5 0C22.75 11.9 17.6 5.5 16 3.5Z'
R='M5.5 25.5c3 2.1 6.6 3.25 10.5 3.25s7.5-1.15 10.5-3.25'
K=21; TX=512-16*K; TY=512-16.9*K
MARK=f'transform="translate({TX} {TY:.1f}) scale({K})"'
TILE='x="100" y="100" width="824" height="824" rx="184"'
SHARED='''<filter id="sh" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".3"/></filter>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="RIMA"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="tile"><rect %s/></clipPath>
<filter id="grain" filterUnits="userSpaceOnUse" x="100" y="100" width="824" height="824"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>
<filter id="ms" filterUnits="userSpaceOnUse" x="-10" y="-10" width="52" height="52"><feDropShadow dx="0" dy=".7" stdDeviation=".8" flood-color="#000" flood-opacity="MSA"/></filter>
<filter id="gl" filterUnits="userSpaceOnUse" x="-10" y="-10" width="52" height="52"><feGaussianBlur stdDeviation="1"/></filter>
<clipPath id="dropc"><path d="M16 3.5c-1.6 2-6.75 8.4-6.75 12.6a6.75 6.75 0 0 0 13.5 0C22.75 11.9 17.6 5.5 16 3.5Z"/></clipPath>''' % TILE
GLOSS='<g clip-path="url(#dropc)"><ellipse cx="13.3" cy="12.6" rx="2" ry="4.6" transform="rotate(24 13.3 12.6)" fill="#fff" opacity=".38" filter="url(#gl)"/><ellipse cx="18.5" cy="21.5" rx="5" ry="2.6" fill="#5a1d08" opacity=".28" filter="url(#gl)"/></g>'
def doc(defs, body, rim=.3, grain=.3, ms=.35):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">
<defs>
{SHARED.replace("RIMA",str(rim)).replace("MSA",str(ms))}
{defs}
</defs>
{body}
<g clip-path="url(#tile)" style="mix-blend-mode:overlay" opacity="{grain}"><rect {TILE} filter="url(#grain)"/></g>
<rect x="102" y="102" width="820" height="820" rx="182" fill="none" stroke="url(#rim)" stroke-width="4"/>
</svg>
'''
def w(name, s): open(f'{out}/{name}.svg','w').write(s)

# STABLE
w('stable', doc('''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a241e"/><stop offset="1" stop-color="#14110e"/></linearGradient>
<linearGradient id="m" gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="30"><stop offset="0" stop-color="#f7b592"/><stop offset="1" stop-color="#d9713f"/></linearGradient>
<filter id="bl" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur stdDeviation="90"/></filter>''',
f'''<rect {TILE} fill="url(#bg)" filter="url(#sh)"/>
<g clip-path="url(#tile)"><circle cx="512" cy="470" r="250" fill="#e8875a" opacity=".3" filter="url(#bl)"/></g>
<g {MARK}><g filter="url(#ms)"><path d="{D}" fill="url(#m)"/><path d="{R}" fill="none" stroke="url(#m)" stroke-width="3" stroke-linecap="round"/></g>{GLOSS}</g>''', rim=.2, grain=.4, ms=.5))

# BETA
w('beta', doc('''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcfaf5"/><stop offset="1" stop-color="#ede5d6"/></linearGradient>
<pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse" x="8" y="-6"><path d="M42 0V42H0" fill="none" stroke="#7fa3e4" stroke-width="1.6" opacity=".4"/></pattern>
<linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="9.5" x2="0" y2="20.5"><stop offset="0" stop-color="#dc6a3c"/><stop offset="1" stop-color="#dc6a3c" stop-opacity="0"/></linearGradient>
<linearGradient id="inkR" gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="19" y2="0"><stop offset="0" stop-color="#dc6a3c"/><stop offset="1" stop-color="#dc6a3c" stop-opacity="0"/></linearGradient>
<clipPath id="up"><rect x="0" y="0" width="32" height="14.6"/></clipPath><clipPath id="dn"><rect x="0" y="14.6" width="32" height="12"/></clipPath>''',
f'''<rect {TILE} fill="url(#bg)" filter="url(#sh)"/>
<g clip-path="url(#tile)"><rect {TILE} fill="url(#grid)"/></g>
<g {MARK} fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16 .8V31.6" stroke="#3a6cd6" stroke-width=".12" stroke-dasharray=".5 .45" opacity=".6"/>
  <g filter="url(#ms)" stroke="#fff"><path d="{D}" fill="#fff" stroke-width="2.2"/><path d="{R}" stroke-width="5.6"/></g>
  <path d="{D}" fill="url(#ink)"/>
  <path d="{D}" stroke="#2f5fc4" stroke-width=".55" clip-path="url(#up)"/>
  <path d="{D}" stroke="#2f5fc4" stroke-width=".55" stroke-dasharray=".05 1.15" clip-path="url(#dn)"/>
  <path d="{R}" stroke="#2f5fc4" stroke-width="3.5"/>
  <path d="{R}" stroke="#fff" stroke-width="2.5"/>
  <path d="{R}" stroke="url(#inkR)" stroke-width="2.5"/>
  <path d="M9.25 10.4V16.1M22.75 10.4V16.1" stroke="#2f5fc4" stroke-width=".16"/>
  <g fill="#2f5fc4"><circle cx="9.25" cy="10.4" r=".42"/><circle cx="22.75" cy="10.4" r=".42"/></g>
  <g fill="#fff" stroke="#2f5fc4" stroke-width=".3"><rect x="15.35" y="2.85" width="1.3" height="1.3"/><rect x="8.6" y="15.45" width="1.3" height="1.3"/><rect x="22.1" y="15.45" width="1.3" height="1.3"/></g>
  <path d="M0 0l2.1 5.6.9-2.2 2.2-.9z" transform="translate(24.4 22.2)" fill="#221d17" stroke="#fff" stroke-width=".32"/>
</g>''', rim=0, grain=.35, ms=.22))

# NIGHTLY
stars=[(214,236,3,.8),(318,168,2,.55),(790,196,3.2,.85),(846,372,2,.5),(176,448,2.2,.5),(668,150,1.8,.45),(872,560,1.8,.35),(158,640,1.6,.3),(430,170,1.6,.4),(250,340,1.4,.35)]
w('nightly', doc('''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0920"/><stop offset=".6" stop-color="#1e0e3c"/><stop offset="1" stop-color="#4c1a3c"/></linearGradient>
<radialGradient id="hz" cx="512" cy="1010" r="540" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff7a45" stop-opacity=".6"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/></radialGradient>
<filter id="glow" filterUnits="userSpaceOnUse" x="-12" y="-12" width="56" height="56"><feGaussianBlur in="SourceGraphic" stdDeviation="1.3" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation=".4" result="b"/><feMerge><feMergeNode in="a"/><feMergeNode in="a"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>''',
f'''<rect {TILE} fill="url(#bg)" filter="url(#sh)"/>
<g clip-path="url(#tile)"><rect {TILE} fill="url(#hz)"/><g fill="#fff">{"".join(f'<circle cx="{x}" cy="{y}" r="{r}" opacity="{o}"/>' for x,y,r,o in stars)}
<path d="M800 286l6 18 18 6-18 6-6 18-6-18-18-6 18-6z" opacity=".9"/></g></g>
<g {MARK} fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">
  <path d="{D}" stroke="#ff5f8f" stroke-width="1.55"/><path d="{R}" stroke="#ff8642" stroke-width="1.55"/>
  <path d="{D}" stroke="#ffe6ee" stroke-width=".5"/><path d="{R}" stroke="#fff0e2" stroke-width=".5"/>
</g>''', rim=.14, grain=.45))

# PREVIEW
n=20; fw=824/n
strips=''.join(f'<clipPath id="f{i}"><rect x="{100+i*fw:.2f}" y="100" width="{fw+.6:.2f}" height="824"/></clipPath><g clip-path="url(#f{i})"><use xlink:href="#scene" transform="translate({100+i*fw+fw/2:.2f} 0) scale(.5 1) translate({-(100+i*fw+fw/2):.2f} 0)"/></g>' for i in range(n))
w('preview', doc(f'''<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf6ee"/><stop offset="1" stop-color="#f3dccb"/></linearGradient>
<linearGradient id="warm" gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="30"><stop offset="0" stop-color="#f6a877"/><stop offset=".55" stop-color="#db6839"/><stop offset="1" stop-color="#96391c"/></linearGradient>
<filter id="soft" filterUnits="userSpaceOnUse" x="-10" y="-10" width="52" height="52"><feGaussianBlur stdDeviation=".2"/></filter>
<filter id="blob" filterUnits="userSpaceOnUse" x="-400" y="-400" width="1824" height="1824"><feGaussianBlur stdDeviation="70"/></filter>
<linearGradient id="flute" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".2" stop-color="#fff" stop-opacity=".1"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset=".9" stop-color="#3a1a0c" stop-opacity=".09"/><stop offset="1" stop-color="#3a1a0c" stop-opacity=".2"/></linearGradient>
<pattern id="reeds" width="{fw}" height="1024" patternUnits="userSpaceOnUse" x="100"><rect width="{fw}" height="1024" fill="url(#flute)"/></pattern>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".1" stop-color="#fff" stop-opacity=".28"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
<g id="scene"><g filter="url(#blob)"><circle cx="330" cy="700" r="170" fill="#8e8cff" opacity=".55"/><circle cx="730" cy="330" r="150" fill="#ff86a8" opacity=".5"/></g>
<g {MARK} filter="url(#soft)"><path d="{D}" fill="url(#warm)"/><path d="{R}" fill="none" stroke="#c9552b" stroke-width="3" stroke-linecap="round"/></g></g>''',
f'''<rect {TILE} fill="url(#bg)" filter="url(#sh)"/>
<g clip-path="url(#tile)">{strips}<rect {TILE} fill="url(#reeds)"/><rect {TILE} fill="url(#sheen)"/></g>''', rim=.7, grain=.5))

# DEV
cells=[tuple(map(int,c.split(','))) for c in cells_s.split(';')]
s=1.6*K
px=''.join(f'<rect x="{TX+(16+(i-9)*1.6)*K-s/2+2.5:.1f}" y="{TY+(2.4+j*1.6)*K-s/2+2.5:.1f}" width="{s-5:.1f}" height="{s-5:.1f}" rx="3.5"/>' for i,j in cells)
w('dev', doc('''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16301d"/><stop offset="1" stop-color="#07130a"/></linearGradient>
<radialGradient id="crt" cx=".5" cy=".46" r=".72"><stop offset="0" stop-color="#11401f"/><stop offset="1" stop-color="#040d07"/></radialGradient>
<radialGradient id="glare" cx="300" cy="230" r="360" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d8ffe2" stop-opacity=".13"/><stop offset="1" stop-color="#d8ffe2" stop-opacity="0"/></radialGradient>
<pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="2" fill="#000" opacity=".22"/></pattern>
<filter id="phos" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feGaussianBlur in="SourceGraphic" stdDeviation="20" result="a"/><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feMerge><feMergeNode in="a"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="scr"><rect x="136" y="136" width="752" height="752" rx="150"/></clipPath>''',
f'''<rect {TILE} fill="url(#bg)" filter="url(#sh)"/>
<rect x="136" y="136" width="752" height="752" rx="150" fill="url(#crt)" stroke="#02070 4" stroke-width="0"/>
<rect x="134" y="134" width="756" height="756" rx="152" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="4"/>
<g fill="#6cf592" filter="url(#phos)">{px}</g>
<g clip-path="url(#scr)"><rect {TILE} fill="url(#scan)"/><rect {TILE} fill="url(#glare)"/></g>''', rim=.22, grain=.35))
