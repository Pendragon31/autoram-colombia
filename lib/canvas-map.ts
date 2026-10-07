import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
export type MapView = { lng: number; lat: number; zoom: number };
export function worldPoint(lng: number, lat: number, zoom: number): [number, number] {
  const size = 256 * 2 ** zoom;
  const sine = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180);
  return [(lng + 180) / 360 * size, (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size];
}
export function worldLocation(x: number, y: number, zoom: number): [number, number] {
  const size = 256 * 2 ** zoom;
  return [x / size * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI];
}
export function fitView(points: [number, number][], width: number, height: number): MapView | null {
  if (!points.length || width <= 0 || height <= 0) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [lng, lat] of points) { const [x, y] = worldPoint(lng, lat, 0); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const zoom = Math.max(8, Math.min(15, Math.floor(Math.log2(Math.min((width - 70) / Math.max(.001, right - left), (height - 70) / Math.max(.001, bottom - top))))));
  const [lng, lat] = worldLocation((left + right) / 2, (top + bottom) / 2, 0);
  return { lng, lat, zoom };
}
type Label = { text: string; x: number; y: number; size: number; priority: number };
export function paintVectorTile(context: CanvasRenderingContext2D, data: ArrayBuffer, x: number, y: number, size: number, zoom: number, dark: boolean): Label[] {
  const tile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const labels: Label[] = [];
  context.save(); context.beginPath(); context.rect(x, y, size, size); context.clip();
  const colors = { earth: dark ? '#17211c' : '#efeee8', landuse: dark ? '#263a2b' : '#dce8d0', water: dark ? '#235463' : '#b4dbe7', buildings: dark ? '#3b4f40' : '#d2cec5' };
  for (const name of ['earth', 'landuse', 'water', 'buildings', 'roads', 'places']) {
    const layer = tile.layers[name];
    if (!layer || name === 'buildings' && zoom < 14) continue;
    const scale = size / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i), geometry = feature.loadGeometry(), properties = feature.properties;
      if (name === 'roads' && properties.kind === 'rail') continue;
      if (feature.type !== 1) {
        context.beginPath();
        for (const line of geometry) {
          line.forEach((point, index) => { if (index === 0) context.moveTo(x + point.x * scale, y + point.y * scale); else context.lineTo(x + point.x * scale, y + point.y * scale); });
          if (feature.type === 3) context.closePath();
        }
        if (feature.type === 3) { context.fillStyle = colors[name as keyof typeof colors] ?? colors.earth; context.fill('evenodd'); }
        else if (name === 'roads') {
          const major = properties.kind === 'highway' || properties.kind === 'major_road';
          const width = Math.max(.8, Math.min(14, 2 ** (zoom - 14) * (major ? 3.5 : 1.8)));
          context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = dark ? '#111a15' : '#c2bcae'; context.lineWidth = width + 1.5; context.stroke();
          context.strokeStyle = major ? dark ? '#d0c28b' : '#fff1ba' : dark ? '#667f6c' : '#ffffff'; context.lineWidth = width; context.stroke();
        }
      }
      const text = properties['name:es'] ?? properties.name;
      if (typeof text !== 'string' || !text || !geometry[0]?.length || name !== 'places' && (name !== 'roads' || zoom < 14)) continue;
      const line = geometry[0], middle = line[Math.floor(line.length / 2)];
      if (name === 'roads') {
        const box = feature.bbox();
        if (Math.hypot(box[2] - box[0], box[3] - box[1]) * scale < 55) continue;
      }
      labels.push({ text: text.slice(0, 42), x: x + middle.x * scale, y: y + middle.y * scale, size: name === 'places' ? 13 : 10, priority: name === 'places' ? 0 : 1 });
    }
  }
  context.restore(); return labels;
}
export function paintLabels(context: CanvasRenderingContext2D, labels: Label[], width: number, height: number, dark: boolean) {
  const boxes: number[][] = [];
  for (const label of labels.sort((a, b) => a.priority - b.priority)) {
    context.font = `${label.size}px system-ui, sans-serif`;
    const w = context.measureText(label.text).width + 8, h = label.size + 8;
    const left = label.x - w / 2, top = label.y - h / 2;
    if (left < 4 || top < 4 || left + w > width - 42 || top + h > height - 20 || boxes.some(box => left < box[2] && left + w > box[0] && top < box[3] && top + h > box[1])) continue;
    boxes.push([left, top, left + w, top + h]);
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineWidth = 3; context.strokeStyle = dark ? '#17211c' : '#faf8ed'; context.strokeText(label.text, label.x, label.y); context.fillStyle = dark ? '#eaf3e6' : '#355344'; context.fillText(label.text, label.x, label.y);
  }
}
