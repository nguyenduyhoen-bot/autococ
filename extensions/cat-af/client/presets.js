/**
 * CAT AF - After Effects Real Executable ExtendScript Presets Library
 */
const EFFECT_PRESETS = [
  {
    id: 'cinematic-reveal',
    category: 'Cinematic',
    title: 'Cinematic Product Reveal',
    description: 'Xuất hiện sản phẩm điện ảnh với đèn chiếu rọi (Spotlight), chuyển động Camera từ từ tiến lại và mờ hậu cảnh (Depth of field).',
    prompt: 'Cinematic Product Reveal with dark studio rim lighting and soft camera push-in',
    code: `// CAT AF: Cinematic Product Reveal
var comp = app.project.activeItem;
var bg = comp.layers.addSolid([0.03, 0.04, 0.06], "Studio_Background", comp.width, comp.height, 1.0);
bg.moveToEnd();

var light = comp.layers.addLight("Rim_Spotlight", [comp.width/2 - 400, comp.height/2 - 600]);
light.lightType = LightType.SPOT;
light.property("Transform").property("Position").setValue([comp.width/2 - 500, comp.height/2 - 800, -800]);
light.property("Light Options").property("Intensity").setValue(140);
light.property("Light Options").property("Cone Angle").setValue(65);

var cam = comp.layers.addCamera("Cinematic_Cam", [comp.width/2, comp.height/2]);
cam.property("Transform").property("Position").setValueAtTime(0, [comp.width/2, comp.height/2, -1800]);
cam.property("Transform").property("Position").setValueAtTime(4, [comp.width/2, comp.height/2, -1100]);

var textLayer = comp.layers.addText("CINEMATIC PRODUCT");
textLayer.threeDLayer = true;
textLayer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2 + 200, 0]);
textLayer.property("Transform").property("Opacity").setValueAtTime(0, 0);
textLayer.property("Transform").property("Opacity").setValueAtTime(2, 100);
`
  },
  {
    id: '3d-camera-orbit',
    category: '3D Motion',
    title: '3D Camera Orbit & Null Controller',
    description: 'Xoay Camera 360 độ quanh tâm chủ thể sử dụng Null Object và biểu thức góc quay toán học.',
    prompt: '3D Camera Orbit with smooth 360 rotation around center null object',
    code: `// CAT AF: 3D Camera Orbit
var comp = app.project.activeItem;
var centerNull = comp.layers.addNull();
centerNull.name = "Camera_Orbit_Target";
centerNull.threeDLayer = true;
centerNull.property("Transform").property("Position").setValue([comp.width/2, comp.height/2, 0]);

var cam = comp.layers.addCamera("Orbit_Camera", [comp.width/2, comp.height/2]);
cam.property("Transform").property("Position").setValue([comp.width/2, comp.height/2, -1400]);
cam.parent = centerNull;

// Animate rotation on Y axis
var yRot = centerNull.property("Transform").property("Y Rotation");
yRot.setValueAtTime(0, 0);
yRot.setValueAtTime(5, 360);
`
  },
  {
    id: 'light-sweep',
    category: 'Light Effects',
    title: 'Light Sweep & Edge Glow',
    description: 'Vệt sáng quét qua bề mặt sản phẩm hoặc typography tạo cảm giác cao cấp bóng bẩy.',
    prompt: 'High-end metallic light sweep reflection across logo surface',
    code: `// CAT AF: Light Sweep & Edge Glow
var comp = app.project.activeItem;
var banner = comp.layers.addSolid([0.08, 0.45, 0.85], "Light_Sweep_Surface", comp.width * 0.7, 180, 1.0);
banner.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

var sweepEffect = banner.property("Effects").addProperty("CC Light Sweep");
if (sweepEffect) {
    sweepEffect.property("Center").setValueAtTime(0, [-100, 90]);
    sweepEffect.property("Center").setValueAtTime(2.5, [banner.width + 100, 90]);
    sweepEffect.property("Edge Intensity").setValue(80);
    sweepEffect.property("Sweep Intensity").setValue(100);
}
`
  },
  {
    id: 'hud-interface',
    category: 'Technology',
    title: 'Cyberpunk HUD Tech Interface',
    description: 'Giao diện quét dữ liệu tương lai với vòng đo tốc độ, khung ngắm mục tiêu và mã số nhấp nháy.',
    prompt: 'Futuristic Sci-Fi HUD target tracking crosshair and biometric data telemetry',
    code: `// CAT AF: Cyberpunk HUD Tech Interface
var comp = app.project.activeItem;
var hudNull = comp.layers.addNull();
hudNull.name = "HUD_Center_Anchor";
hudNull.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

var bracket = comp.layers.addShape();
bracket.name = "HUD_Target_Brackets";
bracket.parent = hudNull;

var telemetry = comp.layers.addText("SYS://TARGET LOCKED [REC: 00:24.9]");
telemetry.property("Transform").property("Position").setValue([comp.width/2 - 120, comp.height/2 + 80]);
telemetry.property("Transform").property("Opacity").expression = "Math.sin(time * 12) > 0 ? 100 : 30;";
`
  },
  {
    id: 'particle-explosion',
    category: 'Particle',
    title: 'Particle Energy Burst',
    description: 'Vụ nổ hạt ánh sáng năng lượng lan tỏa theo hình cầu với gia tốc tan biến.',
    prompt: 'Particle Energy Burst explosion shockwave expanding outwards',
    code: `// CAT AF: Particle Energy Burst
var comp = app.project.activeItem;
var particleSolid = comp.layers.addSolid([0.05, 0.05, 0.08], "Particle_System", comp.width, comp.height, 1.0);
var ccWorld = particleSolid.property("Effects").addProperty("CC Particle World");
if (ccWorld) {
    ccWorld.property("Birth Rate").setValueAtTime(0, 15);
    ccWorld.property("Birth Rate").setValueAtTime(0.3, 0);
    ccWorld.property("Longevity").setValue(2.0);
}
`
  },
  {
    id: 'kinetic-typography',
    category: 'Typography',
    title: 'Kinetic Dynamic Typography Slide',
    description: 'Chữ trượt vào với quán tính Overshoot mượt mà và chuyển động Blur.',
    prompt: 'Kinetic typography with spring bounce overshoot animation',
    code: `// CAT AF: Kinetic Dynamic Typography
var comp = app.project.activeItem;
var title = comp.layers.addText("NEXT-GEN VIDEO CREATIVE");
var pos = title.property("Transform").property("Position");
pos.setValueAtTime(0, [comp.width/2, comp.height + 200]);
pos.setValueAtTime(0.6, [comp.width/2, comp.height/2]);

// Add expression for smooth spring bounce
pos.expression = "var freq = 3; var decay = 5; var ret = value; if (numKeys > 0) { var t = time - key(numKeys).time; if (t > 0) { var v = velocityAtTime(key(numKeys).time - 0.001); ret = value + (v/100) * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t); } } ret;";
`
  },
  {
    id: 'glitch-transition',
    category: 'Transition',
    title: 'Digital Glitch RGB Split',
    description: 'Hiệu ứng nhiễu sóng kỹ thuật số tách phổ màu RGB và dịch chuyển khung hình pixel.',
    prompt: 'Digital cyber glitch transition with chromatic aberration RGB split',
    code: `// CAT AF: Digital Glitch RGB Split
var comp = app.project.activeItem;
var glitchAdj = comp.layers.addSolid([0.5, 0.5, 0.5], "Glitch_Adjustment_Layer", comp.width, comp.height, 1.0);
glitchAdj.adjustmentLayer = true;

// Wiggle position expression for rapid tremor
glitchAdj.property("Transform").property("Position").expression = "wiggle(24, 18);";
`
  },
  {
    id: 'logo-reveal',
    category: 'Logo Reveal',
    title: 'Neon Light Logo Glow Reveal',
    description: 'Logo bừng sáng với hiệu ứng Deep Glow và làn khói chuyển động nền.',
    prompt: 'Neon electric glow logo illumination with atmospheric smoke',
    code: `// CAT AF: Neon Light Logo Glow Reveal
var comp = app.project.activeItem;
var logoLayer = comp.layers.addText("CAT PRODUCT MANAGER");
logoLayer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

var glow = logoLayer.property("Effects").addProperty("Glow");
if (glow) {
    glow.property("Glow Threshold").setValue(50);
    glow.property("Glow Radius").setValueAtTime(0, 10);
    glow.property("Glow Radius").setValueAtTime(2, 85);
    glow.property("Glow Intensity").setValueAtTime(0, 0.5);
    glow.property("Glow Intensity").setValueAtTime(2, 2.5);
}
`
  }
];

if (typeof module !== 'undefined') {
  module.exports = { EFFECT_PRESETS };
}

