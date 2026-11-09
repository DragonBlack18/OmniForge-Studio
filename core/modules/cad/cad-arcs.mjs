/** Shared analytic arc geometry. Angles use degrees, counter-clockwise in XY. */
const round = value => Number(value.toFixed(4));
export const normalizeCadAngle = angle => Number((((angle % 360) + 360) % 360).toFixed(10)) % 360;
export function cadArcSweep(arc) {
  return ((arc.endAngle - arc.startAngle) % 360 + 360) % 360;
}
export function cadArcPoint(arc, angle) {
  const radians = angle * Math.PI / 180;
  return {x: round(arc.center.x + arc.radius * Math.cos(radians)),
    y: round(arc.center.y + arc.radius * Math.sin(radians))};
}
export function cadArcContainsAngle(arc, angle) {
  const offset = ((angle - arc.startAngle) % 360 + 360) % 360;
  return offset <= cadArcSweep(arc) + 1e-9;
}
export function cadArcExtrema(arc) {
  return [arc.startAngle, arc.endAngle, ...[0,90,180,270].filter(angle => cadArcContainsAngle(arc, angle))]
    .map(angle => cadArcPoint(arc, angle));
}
/** SVG coordinates may be world XY (export) or have their Y flipped (viewport). */
export function cadArcPath(arc, flipY = false) {
  const a = cadArcPoint(arc, arc.startAngle), b = cadArcPoint(arc, arc.endAngle);
  const sign = flipY ? -1 : 1;
  return `M ${a.x} ${a.y*sign} A ${arc.radius} ${arc.radius} 0 ${cadArcSweep(arc)>180?1:0} ${flipY?0:1} ${b.x} ${b.y*sign}`;
}
/** Exact circular segment of a DXF polyline; negative bulge reverses CCW ends. */
export function cadArcFromBulge(a, b, bulge) {
  const dx = b.x-a.x, dy = b.y-a.y, chord = Math.hypot(dx,dy);
  if(!Number.isFinite(bulge) || Math.abs(bulge)<1e-10 || chord<0.0001)
    throw new Error('Arco de polilinha inválido ou degenerado.');
  const offset = chord*(1-bulge*bulge)/(4*bulge);
  // Keep source-unit precision until the document boundary converts to mm.
  const center = {x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset};
  const radius = chord*(1+bulge*bulge)/(4*Math.abs(bulge));
  const angle = point => normalizeCadAngle(Math.atan2(point.y-center.y,point.x-center.x)*180/Math.PI);
  return {center,radius,startAngle:angle(bulge>0?a:b),endAngle:angle(bulge>0?b:a)};
}
