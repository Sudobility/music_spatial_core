/** Carefully authored 3D line drawings for the two General MIDI vocalists. */
import {
  spatialModel,
  type InstrumentSpatialModel,
  type SpatialStroke,
} from '@sudobility/music_types';

type Point = readonly [number, number, number];
type Outline = readonly (readonly [number, number])[];

export interface PerformerModel {
  readonly lineModel: InstrumentSpatialModel;
}

function curve(points: readonly Point[], samplesPerSegment = 5): Point[] {
  if (points.length < 3) return [...points];
  const output: Point[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (axis: 0 | 1 | 2): number =>
        0.5 *
        (2 * p1[axis] +
          (-p0[axis] + p2[axis]) * t +
          (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
          (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3);
      output.push([at(0), at(1), at(2)]);
    }
  }
  output.push(points[points.length - 1]!);
  return output;
}

function path(
  strokes: SpatialStroke[],
  points: readonly Point[],
  smooth = true
): void {
  strokes.push(smooth ? curve(points) : [...points]);
}

function outline(
  strokes: SpatialStroke[],
  points: Outline,
  z: number,
  smooth = true
): void {
  const closed = [...points, points[0]!].map(([x, y]): Point => [x, y, z]);
  path(strokes, closed, smooth);
}

function oval(
  strokes: SpatialStroke[],
  center: Point,
  radiusX: number,
  radiusZ: number,
  segments = 28
): void {
  const points: Point[] = [];
  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    points.push([
      center[0] + Math.cos(angle) * radiusX,
      center[1],
      center[2] + Math.sin(angle) * radiusZ,
    ]);
  }
  strokes.push(points);
}

function addMicrophone(
  strokes: SpatialStroke[],
  x: number,
  headY = 1.49
): void {
  path(
    strokes,
    [
      [x, 0.02, 0.29],
      [x, headY - 0.12, 0.29],
      [x - 0.025, headY - 0.09, 0.3],
      [x, headY - 0.07, 0.31],
      [x + 0.025, headY - 0.09, 0.3],
      [x, headY - 0.12, 0.29],
    ],
    false
  );
  oval(strokes, [x, headY, 0.31], 0.027, 0.027, 12);
  oval(strokes, [x, 0.02, 0.29], 0.15, 0.09, 16);
  for (const foot of [-1, 1]) {
    path(
      strokes,
      [
        [x, 0.18, 0.29],
        [x + foot * 0.14, 0.015, 0.29],
      ],
      false
    );
  }
}

function buildMaleVocalist(): PerformerModel {
  const strokes: SpatialStroke[] = [];

  // A mature, clean head silhouette. The face is left open and uncluttered.
  outline(
    strokes,
    [
      [-0.075, 1.68],
      [-0.105, 1.62],
      [-0.1, 1.53],
      [-0.075, 1.45],
      [0, 1.42],
      [0.075, 1.45],
      [0.1, 1.53],
      [0.105, 1.62],
      [0.075, 1.68],
    ],
    0.025,
    true
  );
  outline(
    strokes,
    [
      [-0.074, 1.67],
      [-0.1, 1.61],
      [-0.095, 1.53],
      [-0.07, 1.46],
      [0, 1.435],
      [0.07, 1.46],
      [0.095, 1.53],
      [0.1, 1.61],
      [0.074, 1.67],
    ],
    -0.055,
    true
  );
  path(
    strokes,
    [
      [-0.09, 1.665, 0.035],
      [-0.045, 1.7, 0.045],
      [0, 1.685, 0.05],
      [0.045, 1.7, 0.045],
      [0.09, 1.665, 0.035],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.045, 1.42, 0],
      [-0.045, 1.36, 0],
      [0.045, 1.36, 0],
      [0.045, 1.42, 0],
    ],
    true
  );

  // Lowered fedora: broad brim, shaped crown and a narrow hatband.
  oval(strokes, [0, 1.69, 0], 0.19, 0.105, 32);
  oval(strokes, [0, 1.705, 0], 0.14, 0.075, 32);
  path(
    strokes,
    [
      [-0.14, 1.7, 0],
      [-0.13, 1.79, 0],
      [-0.1, 1.83, 0],
      [0.1, 1.83, 0],
      [0.13, 1.79, 0],
      [0.14, 1.7, 0],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.132, 1.735, 0.018],
      [-0.08, 1.745, 0.045],
      [0, 1.75, 0.05],
      [0.08, 1.745, 0.045],
      [0.132, 1.735, 0.018],
    ],
    true
  );
  path(
    strokes,
    [
      [0, 1.7, -0.075],
      [0, 1.79, -0.13],
      [0, 1.83, -0.1],
    ],
    false
  );

  // Tailored tuxedo jacket, shown as its front and back contours.
  const jacket: Outline = [
    [-0.1, 1.36],
    [-0.19, 1.34],
    [-0.255, 1.27],
    [-0.22, 1.16],
    [-0.19, 1.02],
    [-0.17, 0.88],
    [-0.12, 0.86],
    [0.12, 0.86],
    [0.17, 0.88],
    [0.19, 1.02],
    [0.22, 1.16],
    [0.255, 1.27],
    [0.19, 1.34],
    [0.1, 1.36],
  ];
  outline(strokes, jacket, 0.075, true);
  outline(strokes, jacket, -0.09, true);
  for (const side of [-1, 1]) {
    path(
      strokes,
      [
        [side * 0.19, 1.34, 0.075],
        [side * 0.235, 1.28, 0],
        [side * 0.19, 1.02, -0.09],
      ],
      true
    );
  }
  // Open jacket fronts, satin peaked lapels, and white shirt.
  path(
    strokes,
    [
      [-0.105, 1.36, 0.09],
      [-0.065, 1.29, 0.115],
      [-0.014, 1.2, 0.12],
      [-0.07, 1.12, 0.12],
      [-0.13, 1.27, 0.1],
      [-0.105, 1.36, 0.09],
    ],
    true
  );
  path(
    strokes,
    [
      [0.105, 1.36, 0.09],
      [0.065, 1.29, 0.115],
      [0.014, 1.2, 0.12],
      [0.07, 1.12, 0.12],
      [0.13, 1.27, 0.1],
      [0.105, 1.36, 0.09],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.06, 1.34, 0.105],
      [0, 1.27, 0.12],
      [0.06, 1.34, 0.105],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.045, 1.22, 0.125],
      [-0.055, 1.12, 0.125],
      [0, 1.07, 0.125],
      [0.055, 1.12, 0.125],
      [0.045, 1.22, 0.125],
    ],
    true
  );
  // Bowtie and studs are small dress details, not facial decoration.
  path(
    strokes,
    [
      [-0.018, 1.29, 0.14],
      [-0.067, 1.325, 0.14],
      [-0.063, 1.275, 0.14],
      [-0.018, 1.29, 0.14],
    ],
    false
  );
  path(
    strokes,
    [
      [0.018, 1.29, 0.14],
      [0.067, 1.325, 0.14],
      [0.063, 1.275, 0.14],
      [0.018, 1.29, 0.14],
    ],
    false
  );
  oval(strokes, [0, 1.29, 0.14], 0.012, 0.01, 8);
  for (const y of [1.05, 1.12])
    oval(strokes, [0.095, y, 0.13], 0.006, 0.006, 8);
  path(
    strokes,
    [
      [0.13, 1.16, 0.11],
      [0.2, 1.16, 0.09],
    ],
    false
  );
  path(
    strokes,
    [
      [0.15, 1.18, 0.11],
      [0.16, 1.22, 0.11],
      [0.2, 1.17, 0.1],
    ],
    false
  );

  // Natural sleeve bends, with articulated cuffs and quiet hands.
  path(
    strokes,
    [
      [-0.2, 1.32, 0],
      [-0.28, 1.22, 0.015],
      [-0.29, 1.1, 0.04],
      [-0.23, 1.02, 0.07],
      [-0.2, 0.98, 0.08],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.16, 1.31, 0.03],
      [-0.23, 1.2, 0.07],
      [-0.24, 1.1, 0.1],
      [-0.18, 1.02, 0.12],
      [-0.16, 0.98, 0.12],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.24, 1.04, 0.1],
      [-0.19, 1.02, 0.13],
    ],
    false
  );
  path(
    strokes,
    [
      [-0.2, 0.98, 0.08],
      [-0.19, 0.94, 0.09],
      [-0.16, 0.96, 0.11],
    ],
    true
  );
  path(
    strokes,
    [
      [0.2, 1.32, 0],
      [0.28, 1.24, 0.02],
      [0.3, 1.34, 0.08],
      [0.34, 1.46, 0.16],
    ],
    true
  );
  path(
    strokes,
    [
      [0.16, 1.31, 0.03],
      [0.24, 1.23, 0.07],
      [0.26, 1.34, 0.12],
      [0.3, 1.45, 0.17],
    ],
    true
  );
  path(
    strokes,
    [
      [0.33, 1.44, 0.16],
      [0.3, 1.49, 0.18],
      [0.34, 1.52, 0.18],
      [0.37, 1.49, 0.18],
    ],
    true
  );
  path(
    strokes,
    [
      [0.29, 1.4, 0.14],
      [0.34, 1.4, 0.17],
    ],
    false
  );

  // Separate, tapered trouser legs with a rise, pressed creases and cuffs.
  for (const side of [-1, 1]) {
    const leg: Outline =
      side < 0
        ? [
            [-0.12, 0.88],
            [-0.012, 0.88],
            [-0.018, 0.58],
            [-0.035, 0.13],
            [-0.18, 0.13],
            [-0.19, 0.56],
          ]
        : [
            [0.012, 0.88],
            [0.12, 0.88],
            [0.19, 0.56],
            [0.18, 0.13],
            [0.035, 0.13],
            [0.018, 0.58],
          ];
    outline(strokes, leg, 0.045, true);
    path(
      strokes,
      [
        [side * 0.09, 0.8, 0.05],
        [side * 0.09, 0.53, 0.051],
        [side * 0.105, 0.18, 0.05],
      ],
      true
    );
    path(
      strokes,
      [
        [side * 0.17, 0.15, 0.045],
        [side * 0.1, 0.145, 0.05],
        [side * 0.04, 0.15, 0.045],
      ],
      true
    );
    path(
      strokes,
      [
        [side * 0.115 - 0.07, 0.07, -0.07],
        [side * 0.115 - 0.09, 0.045, 0.07],
        [side * 0.115, 0.035, 0.2],
        [side * 0.115 + 0.075, 0.045, 0.14],
        [side * 0.115 + 0.075, 0.07, -0.07],
      ],
      true
    );
    path(
      strokes,
      [
        [side * 0.115 - 0.075, 0.035, -0.07],
        [side * 0.115, 0.025, 0.2],
        [side * 0.115 + 0.08, 0.035, 0.14],
      ],
      true
    );
    for (const lace of [0.035, 0.07, 0.105]) {
      path(
        strokes,
        [
          [side * 0.115 - 0.035, 0.078, lace],
          [side * 0.115 + 0.035, 0.078, lace + 0.014],
        ],
        false
      );
    }
  }
  path(
    strokes,
    [
      [-0.07, 0.88, 0.05],
      [0, 0.81, 0.065],
      [0.07, 0.88, 0.05],
    ],
    true
  );

  addMicrophone(strokes, 0.34, 1.5);
  return { lineModel: spatialModel('male-vocalist-tuxedo-wireframe', strokes) };
}

function buildFemaleVocalist(): PerformerModel {
  const strokes: SpatialStroke[] = [];

  // A restrained face contour lets the hair and costume carry the portrait.
  outline(
    strokes,
    [
      [-0.072, 1.68],
      [-0.102, 1.62],
      [-0.098, 1.53],
      [-0.07, 1.45],
      [0, 1.42],
      [0.07, 1.45],
      [0.098, 1.53],
      [0.102, 1.62],
      [0.072, 1.68],
    ],
    0.02,
    true
  );
  outline(
    strokes,
    [
      [-0.07, 1.67],
      [-0.098, 1.61],
      [-0.094, 1.53],
      [-0.067, 1.46],
      [0, 1.435],
      [0.067, 1.46],
      [0.094, 1.53],
      [0.098, 1.61],
      [0.07, 1.67],
    ],
    -0.06,
    true
  );
  path(
    strokes,
    [
      [-0.045, 1.42, 0],
      [-0.045, 1.35, 0],
      [0.045, 1.35, 0],
      [0.045, 1.42, 0],
    ],
    true
  );

  // Sculpted long hair: a loose crown, cascading outer contour and distinct ringlets.
  path(
    strokes,
    [
      [-0.11, 1.61, -0.015],
      [-0.12, 1.72, -0.02],
      [-0.07, 1.78, -0.02],
      [0, 1.8, -0.02],
      [0.08, 1.77, -0.02],
      [0.12, 1.69, -0.015],
      [0.11, 1.61, -0.005],
    ],
    true
  );
  for (const side of [-1, 1]) {
    path(
      strokes,
      [
        [side * 0.1, 1.69, 0.015],
        [side * 0.145, 1.6, 0.005],
        [side * 0.17, 1.49, 0],
        [side * 0.19, 1.34, -0.005],
        [side * 0.22, 1.17, -0.01],
        [side * 0.24, 1.0, -0.015],
        [side * 0.2, 0.91, -0.02],
      ],
      true
    );
    path(
      strokes,
      [
        [side * 0.07, 1.71, -0.045],
        [side * 0.15, 1.59, -0.07],
        [side * 0.18, 1.4, -0.08],
        [side * 0.2, 1.18, -0.085],
        [side * 0.19, 0.96, -0.09],
      ],
      true
    );
    for (let curl = 0; curl < 2; curl++) {
      const offset = curl * 0.047;
      const controls: Point[] = [
        [side * (0.095 + offset), 1.62, 0.04],
        [side * (0.17 + offset), 1.53, 0.045],
        [side * (0.095 + offset), 1.43, 0.05],
        [side * (0.18 + offset), 1.32, 0.045],
        [side * (0.1 + offset), 1.21, 0.04],
        [side * (0.18 + offset), 1.1, 0.035],
        [side * (0.11 + offset), 0.99, 0.03],
      ];
      path(strokes, controls, true);
    }
    for (let ringlet = 0; ringlet < 4; ringlet++) {
      const centerY = 1.55 - ringlet * 0.16;
      const centerX = side * (0.145 + (ringlet % 2) * 0.018);
      const loop: Point[] = [];
      for (let index = 0; index <= 20; index++) {
        const angle = (index / 20) * Math.PI * 2;
        loop.push([
          centerX + Math.cos(angle) * 0.033,
          centerY + Math.sin(angle) * 0.05,
          0.058,
        ]);
      }
      strokes.push(loop);
    }
  }
  path(
    strokes,
    [
      [-0.09, 1.68, 0.04],
      [-0.05, 1.7, 0.05],
      [0, 1.65, 0.055],
      [0.06, 1.61, 0.05],
      [0.09, 1.57, 0.04],
    ],
    true
  );

  // A graceful, floor-length evening gown with a fitted bodice and sweeping skirt.
  const dress: Outline = [
    [-0.13, 1.32],
    [-0.22, 1.34],
    [-0.27, 1.28],
    [-0.2, 1.17],
    [-0.15, 1.05],
    [-0.17, 0.9],
    [-0.23, 0.72],
    [-0.31, 0.49],
    [-0.39, 0.24],
    [-0.43, 0.06],
    [-0.28, 0.035],
    [0, 0.02],
    [0.28, 0.035],
    [0.43, 0.06],
    [0.39, 0.24],
    [0.31, 0.49],
    [0.23, 0.72],
    [0.17, 0.9],
    [0.15, 1.05],
    [0.2, 1.17],
    [0.27, 1.28],
    [0.22, 1.34],
    [0.13, 1.32],
  ];
  outline(strokes, dress, 0.055, true);
  outline(strokes, dress, -0.1, true);
  // Sweetheart neckline, bare shoulders and fine straps; avoids a high collar.
  path(
    strokes,
    [
      [-0.14, 1.31, 0.075],
      [-0.13, 1.24, 0.12],
      [-0.08, 1.2, 0.14],
      [0, 1.25, 0.145],
      [0.08, 1.2, 0.14],
      [0.13, 1.24, 0.12],
      [0.14, 1.31, 0.075],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.14, 1.3, 0.05],
      [-0.2, 1.35, 0.01],
      [-0.25, 1.31, 0],
    ],
    true
  );
  path(
    strokes,
    [
      [0.14, 1.3, 0.05],
      [0.2, 1.35, 0.01],
      [0.25, 1.31, 0],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.14, 1.31, 0.06],
      [-0.12, 1.22, 0.12],
      [-0.09, 1.09, 0.145],
      [-0.13, 0.94, 0.14],
      [-0.21, 0.7, 0.105],
      [-0.36, 0.25, 0.07],
      [-0.41, 0.07, 0.05],
    ],
    true
  );
  path(
    strokes,
    [
      [0.14, 1.31, 0.06],
      [0.12, 1.22, 0.12],
      [0.09, 1.09, 0.145],
      [0.13, 0.94, 0.14],
      [0.21, 0.7, 0.105],
      [0.36, 0.25, 0.07],
      [0.41, 0.07, 0.05],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.16, 0.91, 0.13],
      [-0.08, 0.94, 0.15],
      [0, 0.95, 0.155],
      [0.08, 0.94, 0.15],
      [0.16, 0.91, 0.13],
    ],
    true
  );
  // Waist sash and curved panels shape the gown without filling its surfaces.
  path(
    strokes,
    [
      [-0.17, 0.9, 0.14],
      [-0.09, 0.88, 0.15],
      [0, 0.875, 0.155],
      [0.09, 0.88, 0.15],
      [0.17, 0.9, 0.14],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.34, 0.3, 0.065],
      [-0.2, 0.48, 0.11],
      [-0.1, 0.67, 0.14],
      [-0.08, 0.87, 0.15],
    ],
    true
  );
  path(
    strokes,
    [
      [0.34, 0.3, 0.065],
      [0.2, 0.48, 0.11],
      [0.1, 0.67, 0.14],
      [0.08, 0.87, 0.15],
    ],
    true
  );
  path(
    strokes,
    [
      [0, 0.1, 0.13],
      [-0.05, 0.28, 0.12],
      [0.025, 0.45, 0.125],
      [-0.035, 0.61, 0.14],
      [0.025, 0.76, 0.15],
      [0, 0.87, 0.155],
    ],
    true
  );
  // Art nouveau vine work, repeated bead drops and a clean hemline.
  path(
    strokes,
    [
      [-0.025, 0.16, 0.13],
      [0.045, 0.29, 0.12],
      [-0.02, 0.43, 0.13],
      [0.04, 0.56, 0.14],
      [-0.01, 0.7, 0.15],
      [0, 0.86, 0.155],
    ],
    true
  );
  for (const [index, [x, y, z]] of [
    [-0.055, 0.3, 0.125],
    [0.075, 0.39, 0.13],
    [-0.065, 0.5, 0.14],
    [0.06, 0.63, 0.15],
    [-0.045, 0.74, 0.155],
    [0.03, 0.8, 0.155],
  ].entries()) {
    path(
      strokes,
      [
        [x, y, z],
        [x + (index % 2 ? 0.035 : -0.035), y + 0.025, z + 0.004],
        [x + (index % 2 ? 0.05 : -0.05), y + 0.045, z],
      ],
      true
    );
  }
  path(
    strokes,
    [
      [-0.42, 0.075, 0.052],
      [-0.28, 0.055, 0.08],
      [0, 0.045, 0.095],
      [0.28, 0.055, 0.08],
      [0.42, 0.075, 0.052],
    ],
    true
  );

  for (const [row, y] of [0.24, 0.39, 0.54, 0.68, 0.78].entries()) {
    const radius = [0.34, 0.3, 0.26, 0.21, 0.18][row]!;
    const z = [0.072, 0.095, 0.12, 0.14, 0.15][row]!;
    for (const side of [-1, 1]) {
      const x = side * radius * 0.37;
      path(
        strokes,
        [
          [x, y, z],
          [x + side * 0.045, y + 0.025, z + 0.006],
          [x + side * 0.06, y + 0.065, z + 0.008],
          [x + side * 0.035, y + 0.095, z + 0.006],
          [x, y, z],
        ],
        true
      );
      path(
        strokes,
        [
          [x, y, z + 0.01],
          [x + side * 0.04, y + 0.05, z + 0.014],
        ],
        false
      );
    }
  }

  // Long, poised arms; one rests at the waist while the other lifts to sing.
  path(
    strokes,
    [
      [-0.22, 1.32, 0],
      [-0.3, 1.21, 0.025],
      [-0.31, 1.08, 0.08],
      [-0.24, 0.98, 0.14],
      [-0.19, 0.91, 0.16],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.17, 1.31, 0.03],
      [-0.24, 1.19, 0.07],
      [-0.25, 1.08, 0.12],
      [-0.19, 0.99, 0.17],
      [-0.14, 0.93, 0.17],
    ],
    true
  );
  path(
    strokes,
    [
      [-0.19, 0.91, 0.16],
      [-0.16, 0.88, 0.17],
      [-0.13, 0.92, 0.17],
    ],
    true
  );
  path(
    strokes,
    [
      [0.22, 1.32, 0],
      [0.3, 1.23, 0.03],
      [0.32, 1.34, 0.1],
      [0.38, 1.48, 0.19],
    ],
    true
  );
  path(
    strokes,
    [
      [0.17, 1.31, 0.03],
      [0.25, 1.22, 0.075],
      [0.27, 1.34, 0.13],
      [0.34, 1.47, 0.2],
    ],
    true
  );
  path(
    strokes,
    [
      [0.37, 1.45, 0.19],
      [0.34, 1.5, 0.21],
      [0.38, 1.53, 0.21],
      [0.41, 1.5, 0.21],
    ],
    true
  );

  addMicrophone(strokes, 0.38, 1.51);
  return {
    lineModel: spatialModel('female-vocalist-evening-gown-wireframe', strokes),
  };
}

export const MALE_VOCALIST = buildMaleVocalist();
export const FEMALE_VOCALIST = buildFemaleVocalist();
