import math,sys
def bez(p0,p1,p2,p3,t):
    u=1-t; return tuple(u**3*a+3*u*u*t*b+3*u*t*t*c+t**3*d for a,b,c,d in zip(p0,p1,p2,p3))
side=[bez((16,3.5),(14.4,5.5),(9.25,11.9),(9.25,16.1),i/400) for i in range(401)]
def halfw(y):
    best=min(side,key=lambda p:abs(p[1]-y)); return 16-best[0]
rip=[bez((5.5,25.5),(8.5,27.6),(12.1,28.75),(16,28.75),i/200) for i in range(201)]
rip+= [(32-x,y) for x,y in rip]
def inside(x,y):
    if math.hypot(x-16,y-16.1)<=6.75: return True
    if 3.5<=y<=16.1 and abs(x-16)<=halfw(y): return True
    return min(math.hypot(x-a,y-b) for a,b in rip)<=1.5
s=float(sys.argv[1]); n=int(sys.argv[2]); oy=float(sys.argv[3])
cells=[(i,j) for j in range(n) for i in range(n) if inside(16+(i-(n-1)/2)*s, oy+j*s)]
for j in range(n): print(''.join('█' if (i,j) in cells else '·' for i in range(n)),file=sys.stderr)
print(';'.join(f'{i},{j}' for i,j in cells))
