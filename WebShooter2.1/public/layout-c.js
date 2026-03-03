window.WEBSHOOTER_LAYOUT = {
  name: 'Layout C - Quad Arena',
  arenaHalfSize: 600,
  defaultWindowCount: 3,
  coverWalls: [
    // Perimeter split walls (two long segments per side with center gap)
    { x: -420, z: -170, width: 12, depth: 200, height: 14 },
    { x: -420, z: 170, width: 12, depth: 200, height: 14 },
    { x: 420, z: -170, width: 12, depth: 200, height: 14 },
    { x: 420, z: 170, width: 12, depth: 200, height: 14 },
    { x: -170, z: -420, width: 200, depth: 12, height: 14 },
    { x: 170, z: -420, width: 200, depth: 12, height: 14 },
    { x: -170, z: 420, width: 200, depth: 12, height: 14 },
    { x: 170, z: 420, width: 200, depth: 12, height: 14 },
    // Quadrant dividers (create 4 separated zones)
    { x: -170, z: 0, width: 14, depth: 200, height: 11 },
    { x: 170, z: 0, width: 14, depth: 200, height: 11 },
    { x: 0, z: -170, width: 200, depth: 14, height: 11 },
    { x: 0, z: 170, width: 200, depth: 14, height: 11 },
    // Center cross (+)
    { x: 0, z: 0, width: 14, depth: 160, height: 11 },
    { x: 0, z: 0, width: 160, depth: 14, height: 11 }
  ],
  buildings: [
    {
      x: -280, z: -280, width: 110, depth: 86, height: 11,
      doorOffsetsBySide: { east: [0] },
      windowOffsetsBySide: { north: [-28, -8, 16], south: [-20, 12], east: [-16, 16], west: [-18, 10] }
    },
    {
      x: 280, z: -280, width: 110, depth: 86, height: 11,
      doorOffsetsBySide: { west: [0], north: [10] },
      windowOffsetsBySide: { north: [-24, 28], south: [-26, -4, 22], east: [-14, 14], west: [-18, 18] }
    },
    {
      x: -280, z: 280, width: 110, depth: 86, height: 11,
      doorOffsetsBySide: { east: [0], south: [-10], north: [12] },
      windowOffsetsBySide: { north: [-28, -2, 26], south: [-30, 18], east: [-18, 16], west: [-20, 8] }
    },
    {
      x: 280, z: 280, width: 110, depth: 86, height: 11,
      doorOffsetsBySide: { west: [0], south: [-10], east: [8], north: [10] },
      windowOffsetsBySide: { north: [-30, -8, 24], south: [-28, 20], east: [-18, 18], west: [-16, 16] }
    },
    {
      x: -100, z: -280, width: 92, depth: 88, height: 10.6,
      doorOffsetsBySide: { south: [0] },
      windowOffsetsBySide: { north: [-20, 6], south: [-24, 18], east: [-16, 10], west: [-14, 14] }
    },
    {
      x: 100, z: -280, width: 92, depth: 88, height: 10.6,
      doorOffsetsBySide: { south: [0], east: [8] },
      windowOffsetsBySide: { north: [-18, 12], south: [-24, 18], east: [-18, 16], west: [-14, 10] }
    },
    {
      x: -100, z: 280, width: 92, depth: 88, height: 10.6,
      doorOffsetsBySide: { north: [0], west: [-8], east: [8] },
      windowOffsetsBySide: { north: [-24, 18], south: [-18, 8], east: [-16, 16], west: [-18, 14] }
    },
    {
      x: 100, z: 280, width: 92, depth: 88, height: 10.6,
      doorOffsetsBySide: { north: [0], west: [-8], east: [8], south: [0] },
      windowOffsetsBySide: { north: [-22, 20], south: [-20, 10], east: [-16, 16], west: [-16, 16] }
    },
    {
      x: -280, z: -100, width: 88, depth: 92, height: 10.6,
      doorOffsetsBySide: { east: [0] },
      windowOffsetsBySide: { north: [-16, 12], south: [-18, 10], east: [-20, 16], west: [-16, 14] }
    },
    {
      x: -280, z: 100, width: 88, depth: 92, height: 10.6,
      doorOffsetsBySide: { east: [0], north: [8] },
      windowOffsetsBySide: { north: [-20, 18], south: [-16, 8], east: [-18, 18], west: [-14, 14] }
    },
    {
      x: 280, z: -100, width: 88, depth: 92, height: 10.6,
      doorOffsetsBySide: { west: [0], south: [-8], north: [10] },
      windowOffsetsBySide: { north: [-18, 18], south: [-20, 16], east: [-14, 12], west: [-18, 18] }
    },
    {
      x: 280, z: 100, width: 88, depth: 92, height: 10.6,
      doorOffsetsBySide: { west: [0], south: [-8], north: [10], east: [8] },
      windowOffsetsBySide: { north: [-18, 20], south: [-18, 14], east: [-16, 16], west: [-18, 18] }
    }
  ]
};
