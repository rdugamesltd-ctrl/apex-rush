// Points are [x, y, cornerRadius] in units that are multiplied by `scale` (world px).
// Cars drive through the points in order; the start line sits `startOffset` px
// along the straight from point 0 to point 1.
export default {
  id: 'harbor',
  name: 'Harbor Loop',
  theme: 'grass',
  difficulty: 'easy',
  width: 340,
  scale: 108,
  startOffset: 1300,
  price: 0, // the starter track is free; every other track is bought in the shop
  lake: { margin: 420, style: 'harbor' }, // infield lake, starting this far beyond the inner wall
  points: [
    [-8, 0, 6],
    [40, 0, 8],
    [48, 22, 7],
    [30, 34, 6],
    [16, 26, 5],
    [2, 40, 6],
    [-12, 30, 7],
  ],
};
