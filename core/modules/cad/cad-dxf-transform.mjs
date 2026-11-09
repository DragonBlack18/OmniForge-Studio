/** Bounded 2D affine transforms for static DXF INSERT expansion. */
import {normalizeCadAngle} from './cad-arcs.mjs';
export const DXF_IDENTITY=Object.freeze({a:1,b:0,c:0,d:1,x:0,y:0});
export function composeDxfTransform(parent,local) {
  const p=parent,l=local;
  const result={a:p.a*l.a+p.c*l.b,b:p.b*l.a+p.d*l.b,c:p.a*l.c+p.c*l.d,d:p.b*l.c+p.d*l.d,
    x:p.a*l.x+p.c*l.y+p.x,y:p.b*l.x+p.d*l.y+p.y};
  if(!Object.values(result).every(Number.isFinite)||Object.values(result).some(value=>Math.abs(value)>1e12))
    throw new Error('Transformação de bloco DXF excede os limites.');
  return result;
}
export function dxfInsertTransform({position,base,sx=1,sy=1,rotation=0}) {
  if(![position.x,position.y,base.x,base.y,sx,sy,rotation].every(Number.isFinite)||
      Math.abs(sx)<.001||Math.abs(sy)<.001||Math.abs(sx)>1000||Math.abs(sy)>1000)
    throw new Error('Escala ou posição de INSERT inválida.');
  const r=rotation*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
  const a=co*sx,b=si*sx,c=-si*sy,d=co*sy;
  return {a,b,c,d,x:position.x-a*base.x-c*base.y,y:position.y-b*base.x-d*base.y};
}
export function mapDxfPoint(point,matrix,factor=1) {
  const p=point,m=matrix;
  return {x:(m.a*p.x+m.c*p.y+m.x)*factor,y:(m.b*p.x+m.d*p.y+m.y)*factor};
}
export function mapDxfCircle(geometry,matrix,factor=1) {
  const m=matrix,scaleX=Math.hypot(m.a,m.b),scaleY=Math.hypot(m.c,m.d);
  const tolerance=1e-10*Math.max(scaleX,scaleY);
  if(scaleX===0||scaleY===0||Math.abs(scaleX-scaleY)>tolerance||Math.abs(m.a*m.c+m.b*m.d)>1e-10*scaleX*scaleY)
    throw new Error('INSERT com escala não uniforme ou cisalhamento produz elipse; importação cancelada integralmente.');
  const result={center:mapDxfPoint(geometry.center,m,factor),radius:geometry.radius*scaleX*factor};
  if(geometry.startAngle!==undefined){
    const angle=degrees=>{
      const radians=degrees*Math.PI/180,x=Math.cos(radians),y=Math.sin(radians);
      return normalizeCadAngle(Math.atan2(m.b*x+m.d*y,m.a*x+m.c*y)*180/Math.PI);
    };
    const reflection=m.a*m.d-m.b*m.c<0;
    result.startAngle=angle(reflection?geometry.endAngle:geometry.startAngle);
    result.endAngle=angle(reflection?geometry.startAngle:geometry.endAngle);
  }
  return result;
}
