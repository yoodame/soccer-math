// ============================================================
//  SOCCER MATH KICK — Phaser 3 Edition (v2: Open-Field Visual Upgrade)
//  All scenes, audio, physics in one file (no external assets)
// ============================================================

const W = 800;
const H = 600;
const GAME_TIME = 60;
const DPR = window.devicePixelRatio || 1;

// Inclusive avatars: diverse skin tones, genders, hairstyles
const AVATARS = [
    { skin: 0xf4c794, shirt: 0xe63946, hair: 0x222222, hairStyle: 'short' },
    { skin: 0xc68642, shirt: 0x457b9d, hair: 0x1a1a1a, hairStyle: 'short' },
    { skin: 0x8d5524, shirt: 0x2a9d8f, hair: 0x0d0d0d, hairStyle: 'curly' },
    { skin: 0xffe0bd, shirt: 0xe9c46a, hair: 0xd4a030, hairStyle: 'long' },
    { skin: 0xd4a574, shirt: 0x9b5de5, hair: 0x1a1a1a, hairStyle: 'braids' },
    { skin: 0xf0c8a0, shirt: 0xf77f00, hair: 0x8b4513, hairStyle: 'pony' },
    { skin: 0x6b4226, shirt: 0x00bcd4, hair: 0x0d0d0d, hairStyle: 'afro' },
    { skin: 0xfcd5b0, shirt: 0xff69b4, hair: 0x222222, hairStyle: 'bob' },
];

const COLORS = {
    greenDark: 0x1b5e20, greenMid: 0x2e7d32, greenLight: 0x4caf50,
    greenField: 0x388e3c, gold: 0xffd700, red: 0xe63946, blue: 0x1d3557,
    dark: 0x0d1b2a, white: 0xffffff, sky: 0x87ceeb, orange: 0xff6b35,
};

const playerData = { name:'', grade:0, avatarIdx:-1, score:0, streak:0, bestStreak:0, correct:0, wrong:0 };

// ---- Persistence via localStorage ----
function savePlayer() {
    try {
        localStorage.setItem('soccerMath_player', JSON.stringify({
            name: playerData.name,
            grade: playerData.grade,
            avatarIdx: playerData.avatarIdx
        }));
    } catch(e) {}
}
function loadPlayer() {
    try {
        const saved = JSON.parse(localStorage.getItem('soccerMath_player'));
        if (saved && saved.name) {
            playerData.name = saved.name;
            playerData.grade = saved.grade || 0;
            playerData.avatarIdx = saved.avatarIdx >= 0 ? saved.avatarIdx : -1;
            return true;
        }
    } catch(e) {}
    return false;
}

// HiDPI text helper
function ts(style) { return Object.assign({ resolution: DPR }, style); }

// Canvas 2D helper: rounded rect path
function rrPath(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = { tl:r, tr:r, bl:r, br:r };
    ctx.beginPath();
    ctx.moveTo(x+r.tl, y);
    ctx.lineTo(x+w-r.tr, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r.tr);
    ctx.lineTo(x+w, y+h-r.br);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r.br, y+h);
    ctx.lineTo(x+r.bl, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r.bl);
    ctx.lineTo(x, y+r.tl);
    ctx.quadraticCurveTo(x, y, x+r.tl, y);
    ctx.closePath();
}

// Hex int to CSS string
function hexCSS(hex, alpha) {
    const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
    return alpha !== undefined ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

// Draw shared field background (used by Profile, Game, GameOver)
function drawField(scene) {
    const bg = scene.add.graphics();
    // Sky gradient
    bg.fillGradientStyle(0x4a90d9, 0x4a90d9, 0xadd8e6, 0xadd8e6);
    bg.fillRect(0, 0, W, 140);
    // Stadium light glow
    bg.fillStyle(0xffffff, 0.08); bg.fillCircle(W/2, 0, 200);
    bg.fillStyle(0xffffff, 0.04); bg.fillCircle(W/2, 0, 320);
    // Field
    bg.fillGradientStyle(0x4caf50, 0x4caf50, 0x2e7d32, 0x2e7d32);
    bg.fillRect(0, 140, W, H-140);
    // Mowing stripes
    for (let y = 140; y < H; y += 25) {
        const i = Math.floor((y-140)/25);
        bg.fillStyle(i%2===0 ? 0x000000 : 0xffffff, 0.04);
        bg.fillRect(0, y, W, 25);
    }
    // Grass grain
    for (let i = 0; i < 150; i++) {
        bg.fillStyle(Math.random()>.5 ? 0x000000 : 0xffffff, 0.015);
        bg.fillCircle(Phaser.Math.Between(0,W), Phaser.Math.Between(145,H), 1);
    }
    return bg;
}

// Draw perspective field markings anchored to the goal dimensions
function drawFieldMarkings(scene) {
    const mk = scene.add.graphics();
    const cx = W/2;

    // ---- Perspective system anchored to the goal ----
    // The goal is 240px wide at y=210 (goalW from drawGoal).
    // Real-world: goal = 7.32m, 6-yard box = 18.32m wide, penalty box = 40.32m wide.
    // So 6-yard box is 2.503× goal width, penalty box is 5.509× goal width.
    const vanishY = 50;       // vanishing point near horizon
    const goalLineY = 210;    // bottom of goal posts on screen
    const goalHalfW = 120;    // half the goal width on screen (240/2)

    // Perspective helper: given a real-world half-width (in meters) and a screen Y,
    // return the screen half-width. We calibrate so that at goalLineY,
    // 3.66m (half-goal) maps to 120px.
    const goalHalfM = 3.66;   // real half-goal in meters
    const pxPerMeterAtGoalLine = goalHalfW / goalHalfM; // ~32.8 px/m at goalLineY
    function perspHW(realHalfMeters, y) {
        // Scale relative to goal line depth
        const depthAtGoalLine = goalLineY - vanishY; // 160
        const depthAtY = y - vanishY;
        return realHalfMeters * pxPerMeterAtGoalLine * (depthAtY / depthAtGoalLine);
    }

    // Real-world half-widths in meters
    const sixYardHalfM = 9.16;    // 18.32m / 2
    const penaltyHalfM = 20.16;   // 40.32m / 2

    // Y positions on screen (how far down the field extends toward viewer)
    // 6-yard box depth: 5.5m from goal line. Penalty box: 16.5m. Penalty spot: 11m.
    // We map these depths to screen Y offsets from goalLineY.
    // Use a depth-to-Y function: further from goal → larger Y (closer to camera).
    // At goalLineY, depth=0m. We need a scale for depth → Y pixels.
    // The penalty spot (11m from goal) should be around y=400, so 11m → 190px → ~17.3 px/m
    const depthScale = 17.5; // pixels per meter of field depth
    const sixBotY = goalLineY + 5.5 * depthScale;    // ~306
    const penaltyBotY = goalLineY + 16.5 * depthScale;// ~499
    const penaltySpotY = goalLineY + 11 * depthScale;  // ~403

    // --- Goal line (full width across the field, extends beyond penalty box) ---
    mk.lineStyle(2.5, 0xffffff, 0.60);
    const glHW = perspHW(penaltyHalfM * 1.15, goalLineY); // goal line wider than penalty box
    mk.lineBetween(cx - glHW, goalLineY, cx + glHW, goalLineY);

    // --- 6-yard box (goal area) ---
    mk.lineStyle(2.0, 0xffffff, 0.55);
    const sixTopHW = perspHW(sixYardHalfM, goalLineY);
    const sixBotHW = perspHW(sixYardHalfM, sixBotY);
    mk.beginPath();
    mk.moveTo(cx - sixTopHW, goalLineY); mk.lineTo(cx + sixTopHW, goalLineY);
    mk.lineTo(cx + sixBotHW, sixBotY); mk.lineTo(cx - sixBotHW, sixBotY);
    mk.closePath(); mk.strokePath();

    // --- Penalty box ---
    mk.lineStyle(2.5, 0xffffff, 0.65);
    const penTopHW = perspHW(penaltyHalfM, goalLineY);
    const penBotHW = perspHW(penaltyHalfM, penaltyBotY);
    mk.beginPath();
    mk.moveTo(cx - penTopHW, goalLineY); mk.lineTo(cx + penTopHW, goalLineY);
    mk.lineTo(cx + penBotHW, penaltyBotY); mk.lineTo(cx - penBotHW, penaltyBotY);
    mk.closePath(); mk.strokePath();

    // --- Penalty spot ---
    mk.fillStyle(0xffffff, 0.70);
    mk.fillCircle(cx, penaltySpotY, 4);

    // --- Penalty arc (curved line outside penalty box, only the part outside the box) ---
    mk.lineStyle(1.8, 0xffffff, 0.50);
    const arcRealRadius = 9.15; // 9.15m radius from penalty spot
    const arcSegments = 24;
    mk.beginPath();
    let started = false;
    for (let i = 0; i <= arcSegments; i++) {
        // Sweep from left to right across the top of the arc (below the penalty box bottom)
        const a = Math.PI * 1.12 + (Math.PI * 0.76) * (i / arcSegments);
        const realOffX = Math.cos(a) * arcRealRadius; // meters offset from center
        const realOffY = Math.sin(a) * arcRealRadius; // meters offset from penalty spot
        const py = penaltySpotY + realOffY * depthScale;
        // Only draw the part that's outside (below) the penalty box
        if (py > penaltyBotY) {
            const px = cx + perspHW(Math.abs(realOffX), py) * Math.sign(realOffX);
            if (!started) { mk.moveTo(px, py); started = true; } else mk.lineTo(px, py);
        }
    }
    mk.strokePath();

    // --- Touchline segments (sidelines extending from penalty box toward viewer) ---
    mk.lineStyle(2.0, 0xffffff, 0.35);
    const touchHalfM = penaltyHalfM * 1.6; // touchlines wider than penalty box
    const touchTopHW = perspHW(touchHalfM, penaltyBotY);
    const touchBotHW = perspHW(touchHalfM, H);
    mk.lineBetween(cx - touchTopHW, penaltyBotY, cx - touchBotHW, H);
    mk.lineBetween(cx + touchTopHW, penaltyBotY, cx + touchBotHW, H);

    return mk;
}

// Draw 3D-perspective goal
function drawGoal(scene) {
    const g = scene.add.graphics();
    const cx = W/2;
    const goalW = 240;       // crossbar width
    const goalH = 80;        // post height
    const crossbarY = 130;   // top of crossbar
    const bottomY = crossbarY + goalH; // bottom of posts on field
    const postW = 6;         // post thickness
    const crossbarH = 6;     // crossbar thickness
    const netDepth = 30;     // how far back the net goes (perspective depth)

    // --- Net (grid inside the goal frame) ---
    const netL = cx - goalW/2 + postW/2;
    const netR = cx + goalW/2 - postW/2;
    const netTop = crossbarY + crossbarH;
    const netBot = bottomY;
    const netW = netR - netL;
    const netH = netBot - netTop;

    // Subtle dark backing to give net depth
    g.fillStyle(0x1a3a1a, 0.15);
    g.fillRect(netL, netTop, netW, netH);

    // Vertical net lines (straight, evenly spaced)
    const vLines = 14;
    g.lineStyle(0.7, 0xffffff, 0.12);
    for (let i = 1; i < vLines; i++) {
        const x = netL + (netW / vLines) * i;
        g.lineBetween(x, netTop, x, netBot);
    }
    // Horizontal net lines
    const hLines = 6;
    for (let i = 1; i < hLines; i++) {
        const y = netTop + (netH / hLines) * i;
        g.lineBetween(netL, y, netR, y);
    }

    // --- Ground shadow beneath crossbar ---
    g.fillStyle(0x000000, 0.06);
    g.fillEllipse(cx, bottomY + 6, goalW - 20, 8);

    // --- Left post (vertical rectangle with gradient shading) ---
    const lp = cx - goalW/2;
    g.fillStyle(0xcccccc, 0.9); g.fillRect(lp - postW/2, crossbarY, postW, goalH);
    g.fillStyle(0xffffff, 0.5); g.fillRect(lp - postW/2 + 1, crossbarY, 2, goalH);  // highlight
    g.fillStyle(0x999999, 0.3); g.fillRect(lp + postW/2 - 1, crossbarY, 1, goalH);  // shadow edge

    // --- Right post ---
    const rp = cx + goalW/2;
    g.fillStyle(0xcccccc, 0.9); g.fillRect(rp - postW/2, crossbarY, postW, goalH);
    g.fillStyle(0xffffff, 0.5); g.fillRect(rp - postW/2, crossbarY, 2, goalH);      // highlight
    g.fillStyle(0x999999, 0.3); g.fillRect(rp + postW/2 - 1, crossbarY, 1, goalH);  // shadow edge

    // --- Crossbar (horizontal bar on top) ---
    g.fillStyle(0xdddddd, 0.95); g.fillRect(lp - postW/2, crossbarY, goalW + postW, crossbarH);
    g.fillStyle(0xffffff, 0.5);  g.fillRect(lp - postW/2, crossbarY, goalW + postW, 2);         // top highlight
    g.fillStyle(0xaaaaaa, 0.3);  g.fillRect(lp - postW/2, crossbarY + crossbarH - 1, goalW + postW, 1); // bottom shadow

    g.setDepth(2);
    return g;
}

// Draw parallax clouds
function drawClouds(scene) {
    const layers = [
        { count:3, yMin:10, yMax:45, sMin:80, sMax:120, a:0.15, sp:25000 },
        { count:3, yMin:30, yMax:75, sMin:55, sMax:90, a:0.25, sp:17000 },
        { count:2, yMin:55, yMax:100, sMin:45, sMax:70, a:0.4, sp:11000 },
    ];
    layers.forEach(l => {
        for (let i=0; i<l.count; i++) {
            const c = scene.add.graphics();
            const s = Phaser.Math.Between(l.sMin, l.sMax);
            const h = s*0.3;
            c.fillStyle(0xffffff, l.a);
            c.fillEllipse(0, 0, s, h);
            c.fillEllipse(s*.3, -h*.2, s*.55, h*.8);
            c.fillEllipse(-s*.3, -h*.15, s*.5, h*.7);
            // Subtle dark underside
            c.fillStyle(0x000000, 0.02);
            c.fillEllipse(0, h*.15, s*.7, h*.35);
            c.setPosition(Phaser.Math.Between(50,W-50), Phaser.Math.Between(l.yMin, l.yMax));
            scene.tweens.add({ targets:c, x:c.x+Phaser.Math.Between(120,220), duration:Phaser.Math.Between(l.sp-2000,l.sp+2000), repeat:-1, yoyo:true, ease:'Sine.easeInOut' });
        }
    });
}

// Draw vignette overlay
function drawVignette(scene) {
    const v = scene.add.graphics().setDepth(30);
    v.fillGradientStyle(0x000000,0x000000,0x000000,0x000000, 0.25,0.25,0,0);
    v.fillRect(0,0,W,50);
    v.fillGradientStyle(0x000000,0x000000,0x000000,0x000000, 0,0,0.15,0.15);
    v.fillRect(0,H-50,W,50);
    v.fillGradientStyle(0x000000,0x000000,0x000000,0x000000, 0.1,0,0.1,0);
    v.fillRect(0,0,30,H);
    v.fillGradientStyle(0x000000,0x000000,0x000000,0x000000, 0,0.1,0,0.1);
    v.fillRect(W-30,0,30,H);
    return v;
}

// ============================================================
//  AUDIO ENGINE
// ============================================================
const SFX = {
    _ctx: null,
    getCtx() {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._ctx.state === 'suspended') this._ctx.resume();
        return this._ctx;
    },
    playNote(freq, duration, type = 'square', vol = 0.12) {
        const c = this.getCtx(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + duration);
    },
    kick() {
        const c = this.getCtx(), t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.12);
    },
    goal() {
        [523.25,659.25,783.99,1046.50].forEach((f,i) => setTimeout(() => this.playNote(f,.3,'square',.1), i*100));
        setTimeout(() => { this.playNote(523.25,.5,'triangle',.08); this.playNote(659.25,.5,'triangle',.08); this.playNote(783.99,.5,'triangle',.08); }, 400);
    },
    goalMusic() {
        const m = [[523,.15],[523,.15],[587,.15],[659,.3],[587,.15],[659,.15],[783,.4],[659,.15],[783,.15],[880,.15],[1046,.5]];
        let t = 0;
        m.forEach(([f,d]) => { setTimeout(() => { this.playNote(f,d+.1,'square',.08); this.playNote(f/2,d+.1,'triangle',.05); }, t*1000); t += d; });
    },
    miss() { this.playNote(300,.15,'sawtooth',.08); setTimeout(() => this.playNote(200,.3,'sawtooth',.06), 120); },
    whistle() {
        const c = this.getCtx();
        const w = (freq,dur,del) => setTimeout(() => { const t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='sine'; o.frequency.value=freq; g.gain.setValueAtTime(.1,t); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur); }, del);
        w(2800,.6,0); w(3000,.3,200);
    },
    streak() { [440,554,659,880,1108,1318].forEach((f,i) => setTimeout(() => this.playNote(f,.2,'square',.06), i*60)); },
    gameOver() { for(let i=0;i<3;i++) setTimeout(() => { const c=this.getCtx(),t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='sine'; o.frequency.value=2800; g.gain.setValueAtTime(.1,t); g.gain.exponentialRampToValueAtTime(.001,t+.4); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+.4); }, i*500); },
    click() { this.playNote(800,.06,'sine',.08); }
};

// ============================================================
//  MATH ENGINE
// ============================================================
function generateEquation(grade) {
    const rand = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
    let a,b,op,answer;
    if (grade<=2) { op=Math.random()<.5?'+':'-'; if(op==='+'){a=rand(1,10*grade);b=rand(1,10*grade);answer=a+b;}else{a=rand(2,10*grade);b=rand(1,a);answer=a-b;} }
    else if (grade===3) { const r=Math.random(); if(r<.33){op='+';a=rand(10,50);b=rand(10,50);answer=a+b;}else if(r<.66){op='-';a=rand(20,80);b=rand(1,a);answer=a-b;}else{op='\u00d7';a=rand(2,9);b=rand(2,9);answer=a*b;} }
    else if (grade===4) { const r=Math.random(); if(r<.25){op='+';a=rand(50,200);b=rand(50,200);answer=a+b;}else if(r<.5){op='-';a=rand(50,300);b=rand(1,a);answer=a-b;}else if(r<.75){op='\u00d7';a=rand(2,12);b=rand(2,12);answer=a*b;}else{op='\u00f7';b=rand(2,10);answer=rand(2,10);a=b*answer;} }
    else { const r=Math.random(); if(r<.2){op='+';a=rand(100,500);b=rand(100,500);answer=a+b;}else if(r<.4){op='-';a=rand(100,999);b=rand(1,a);answer=a-b;}else if(r<.6){op='\u00d7';a=rand(3,15);b=rand(3,15);answer=a*b;}else if(r<.8){op='\u00f7';b=rand(2,12);answer=rand(2,15);a=b*answer;}else{const c=rand(2,5);b=rand(2,9);a=rand(1,20);return{text:`${a} + ${b} \u00d7 ${c} = ?`,answer:a+b*c};} }
    return { text:`${a} ${op} ${b} = ?`, answer };
}

function generateChoices(correct) {
    const set = new Set([correct]);
    const range = Math.max(5, Math.abs(correct)*.4);
    let att=0;
    while(set.size<4&&att<50){let w=correct+Math.floor(Math.random()*range*2-range);if(w===correct)w+=(Math.random()<.5?1:-1)*(Math.floor(Math.random()*3)+1);if(w<0&&correct>=0)w=Math.abs(w);set.add(w);att++;}
    while(set.size<4) set.add(correct+set.size);
    return Phaser.Utils.Array.Shuffle([...set]);
}

// ============================================================
//  BOOT SCENE — Generate all textures with gradients via CanvasTexture
// ============================================================
class BootScene extends Phaser.Scene {
    constructor() { super('Boot'); }

    // Helper to create a CanvasTexture with native Canvas 2D drawing
    ct(key, w, h, fn) {
        const t = this.textures.createCanvas(key, w, h);
        fn(t.context, w, h);
        t.refresh();
    }

    create() {
        const g = this.make.graphics({ add: false });

        // ---- Soccer ball (72x72) with radial shading ----
        this.ct('ball', 72, 72, (ctx) => {
            // Sphere shading
            const grad = ctx.createRadialGradient(28, 26, 4, 36, 36, 35);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, '#f5f5f5');
            grad.addColorStop(0.7, '#d0d0d0');
            grad.addColorStop(1.0, '#999999');
            ctx.beginPath(); ctx.arc(36, 36, 35, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill();
            // Pentagon patches
            const drawPent = (cx,cy,r,c1,c2) => {
                const pg = ctx.createLinearGradient(cx, cy-r, cx, cy+r);
                pg.addColorStop(0, c1); pg.addColorStop(1, c2);
                ctx.fillStyle = pg; ctx.beginPath();
                for (let i=0;i<5;i++){const a=(i*72-90)*Math.PI/180; i===0?ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r):ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
                ctx.closePath(); ctx.fill();
            };
            drawPent(36, 36, 13, '#2a2a2a', '#444');
            for (let i=0;i<5;i++){const a=(i*72-90)*Math.PI/180; drawPent(36+Math.cos(a)*23, 36+Math.sin(a)*23, 7, '#333', '#555');}
            // Specular highlight
            const spec = ctx.createRadialGradient(26, 22, 0, 26, 22, 14);
            spec.addColorStop(0, 'rgba(255,255,255,0.7)');
            spec.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = spec; ctx.beginPath(); ctx.arc(26, 22, 14, 0, Math.PI*2); ctx.fill();
            // Edge
            ctx.strokeStyle = '#888'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(36, 36, 34.5, 0, Math.PI*2); ctx.stroke();
        });

        // ---- Star-shaped particle (12x12) ----
        this.ct('particle', 12, 12, (ctx) => {
            ctx.fillStyle = '#ffffff'; ctx.beginPath();
            ctx.moveTo(6,0); ctx.lineTo(7.5,4.5); ctx.lineTo(12,6); ctx.lineTo(7.5,7.5);
            ctx.lineTo(6,12); ctx.lineTo(4.5,7.5); ctx.lineTo(0,6); ctx.lineTo(4.5,4.5);
            ctx.closePath(); ctx.fill();
        });

        // ---- Star (48x48) ----
        g.clear(); g.fillStyle(0xffd700);
        g.fillPoints(this.starPts(24,24,24,12,5), true);
        g.lineStyle(2, 0xffaa00); g.strokePoints(this.starPts(24,24,24,12,5), true);
        g.generateTexture('star', 48, 48);

        // ---- Avatar textures (100x136) with shading ----
        AVATARS.forEach((av, idx) => {
            g.clear();
            // Ground shadow
            g.fillStyle(0x000000, 0.15); g.fillEllipse(50, 132, 50, 10);

            // Hair behind head
            g.fillStyle(av.hair);
            if (av.hairStyle === 'short') { g.fillEllipse(50, 18, 50, 30); }
            else if (av.hairStyle === 'curly') { g.fillCircle(50, 20, 28); for(let a=0;a<Math.PI*2;a+=0.5) g.fillCircle(50+Math.cos(a)*26, 20+Math.sin(a)*26, 6); }
            else if (av.hairStyle === 'long') { g.fillEllipse(50, 18, 52, 28); g.fillRoundedRect(22,16,14,50,6); g.fillRoundedRect(64,16,14,50,6); }
            else if (av.hairStyle === 'braids') { g.fillEllipse(50,16,52,28); g.fillRoundedRect(20,16,10,55,5); g.fillRoundedRect(70,16,10,55,5); g.fillStyle(0xffd700); g.fillCircle(25,70,4); g.fillCircle(75,70,4); g.fillStyle(av.hair); }
            else if (av.hairStyle === 'pony') { g.fillEllipse(50,16,52,28); g.fillRoundedRect(60,8,10,40,5); g.fillStyle(av.shirt); g.fillCircle(65,12,4); g.fillStyle(av.hair); }
            else if (av.hairStyle === 'afro') { g.fillCircle(50, 18, 32); }
            else if (av.hairStyle === 'bob') { g.fillEllipse(50,18,56,32); g.fillRoundedRect(22,14,56,30,8); }

            // Hair volume shading
            g.fillStyle(0x000000, 0.1);
            if (av.hairStyle === 'afro') g.fillCircle(55, 22, 28);
            else g.fillEllipse(55, 20, 44, 26);

            // Head
            g.fillStyle(av.skin); g.fillCircle(50, 30, 24);
            g.fillCircle(26, 30, 6); g.fillCircle(74, 30, 6);
            // Face shading (darker right edge)
            g.fillStyle(0x000000, 0.06); g.fillCircle(55, 33, 22);
            // Cheek highlights
            g.fillStyle(0xffffff, 0.08); g.fillCircle(38, 34, 6); g.fillCircle(62, 34, 6);

            // Forehead hair
            if (av.hairStyle === 'short') { g.fillStyle(av.hair); g.fillEllipse(50,12,46,20); }

            // Eyes
            g.fillStyle(0xffffff); g.fillCircle(40,28,6); g.fillCircle(60,28,6);
            g.fillStyle(0x222222); g.fillCircle(42,28,3.5); g.fillCircle(62,28,3.5);
            g.fillStyle(0xffffff); g.fillCircle(43,26,1.5); g.fillCircle(63,26,1.5);
            // Eyebrows
            g.lineStyle(2.5, av.hair);
            g.beginPath(); g.arc(40,22,7,Math.PI+0.3,Math.PI*2-0.3); g.strokePath();
            g.beginPath(); g.arc(60,22,7,Math.PI+0.3,Math.PI*2-0.3); g.strokePath();
            // Nose
            g.fillStyle(av.skin, 0.7); g.fillCircle(50,34,3);
            // Smile
            g.lineStyle(2.5, 0x994444);
            g.beginPath(); g.arc(50,36,10,0.15,Math.PI-0.15,false); g.strokePath();
            // Shirt
            g.fillStyle(av.shirt); g.fillRoundedRect(24,54,52,36,8);
            // Shirt highlight
            g.fillStyle(0xffffff, 0.1); g.fillEllipse(50, 64, 28, 18);
            // Shirt shadow
            g.fillStyle(0x000000, 0.08); g.fillRect(26, 82, 48, 8);
            // Collar
            g.fillStyle(av.shirt, 0.7); g.fillTriangle(42,54,50,62,58,54);
            // Number
            g.fillStyle(0xffffff, 0.2); g.fillCircle(50,68,8);
            // Shorts
            g.fillStyle(0x1a1a2e); g.fillRoundedRect(28,88,20,20,4); g.fillRoundedRect(52,88,20,20,4);
            // Legs
            g.fillStyle(av.skin); g.fillRect(33,106,12,16); g.fillRect(55,106,12,16);
            // Socks
            g.fillStyle(av.shirt); g.fillRect(31,114,16,10); g.fillRect(53,114,16,10);
            // Shoes
            g.fillStyle(0x111111); g.fillRoundedRect(29,122,20,10,4); g.fillRoundedRect(51,122,20,10,4);
            g.fillStyle(0x333333); g.fillRect(32,124,14,2); g.fillRect(54,124,14,2);
            g.generateTexture('avatar_'+idx, 100, 136);
        });

        // ---- Goalkeeper texture (100x136) ----
        g.clear();
        const gkSkin = 0xd4a574, gkShirt = 0xFFEB3B, gkHair = 0x222222, gkGlove = 0xFF6D00;
        // Ground shadow
        g.fillStyle(0x000000, 0.15); g.fillEllipse(50, 132, 50, 10);
        // Hair behind head (short)
        g.fillStyle(gkHair); g.fillEllipse(50, 18, 50, 30);
        // Hair volume shading
        g.fillStyle(0x000000, 0.1); g.fillEllipse(55, 20, 44, 26);
        // Head
        g.fillStyle(gkSkin); g.fillCircle(50, 30, 24);
        g.fillCircle(26, 30, 6); g.fillCircle(74, 30, 6);
        g.fillStyle(0x000000, 0.06); g.fillCircle(55, 33, 22);
        g.fillStyle(0xffffff, 0.08); g.fillCircle(38, 34, 6); g.fillCircle(62, 34, 6);
        // Forehead hair
        g.fillStyle(gkHair); g.fillEllipse(50,12,46,20);
        // Cap/headband
        g.fillStyle(gkShirt, 0.8); g.fillRoundedRect(26, 6, 48, 10, 5);
        // Eyes
        g.fillStyle(0xffffff); g.fillCircle(40,28,6); g.fillCircle(60,28,6);
        g.fillStyle(0x222222); g.fillCircle(42,28,3.5); g.fillCircle(62,28,3.5);
        g.fillStyle(0xffffff); g.fillCircle(43,26,1.5); g.fillCircle(63,26,1.5);
        // Eyebrows
        g.lineStyle(2.5, gkHair);
        g.beginPath(); g.arc(40,22,7,Math.PI+0.3,Math.PI*2-0.3); g.strokePath();
        g.beginPath(); g.arc(60,22,7,Math.PI+0.3,Math.PI*2-0.3); g.strokePath();
        // Nose + Smile
        g.fillStyle(gkSkin, 0.7); g.fillCircle(50,34,3);
        g.lineStyle(2.5, 0x994444);
        g.beginPath(); g.arc(50,36,8,0.3,Math.PI-0.3,false); g.strokePath();
        // Jersey (yellow)
        g.fillStyle(gkShirt); g.fillRoundedRect(24,54,52,36,8);
        g.fillStyle(0xffffff, 0.12); g.fillEllipse(50, 64, 28, 18);
        g.fillStyle(0x000000, 0.08); g.fillRect(26, 82, 48, 8);
        g.fillStyle(gkShirt, 0.7); g.fillTriangle(42,54,50,62,58,54);
        // #1 on jersey
        g.fillStyle(0x000000, 0.25); g.fillCircle(50,68,8);
        // Arms wider (ready stance)
        g.fillStyle(gkSkin); g.fillRoundedRect(8,58,18,10,4); g.fillRoundedRect(74,58,18,10,4);
        // Gloves (large orange blocks)
        g.fillStyle(gkGlove); g.fillRoundedRect(4,62,20,16,6); g.fillRoundedRect(76,62,20,16,6);
        g.fillStyle(0xffffff, 0.2); g.fillRect(8,64,12,3); g.fillRect(80,64,12,3);
        // Shorts (black)
        g.fillStyle(0x1a1a2e); g.fillRoundedRect(28,88,20,20,4); g.fillRoundedRect(52,88,20,20,4);
        // Legs
        g.fillStyle(gkSkin); g.fillRect(33,106,12,16); g.fillRect(55,106,12,16);
        // Socks (yellow)
        g.fillStyle(gkShirt); g.fillRect(31,114,16,10); g.fillRect(53,114,16,10);
        // Shoes
        g.fillStyle(0x111111); g.fillRoundedRect(29,122,20,10,4); g.fillRoundedRect(51,122,20,10,4);
        g.fillStyle(0x333333); g.fillRect(32,124,14,2); g.fillRect(54,124,14,2);
        g.generateTexture('goalkeeper', 100, 136);

        // ---- Green button with gradient (440x100) ----
        this.ct('btnGreen', 440, 100, (ctx) => {
            rrPath(ctx, 0, 0, 440, 100, 24);
            ctx.fillStyle = '#2e7d32'; ctx.fill();
            const body = ctx.createLinearGradient(0, 4, 0, 96);
            body.addColorStop(0, '#66bb6a'); body.addColorStop(0.5, '#4caf50'); body.addColorStop(1, '#388e3c');
            rrPath(ctx, 4, 4, 432, 92, 22);
            ctx.fillStyle = body; ctx.fill();
            // Gloss
            const gloss = ctx.createLinearGradient(0, 6, 0, 50);
            gloss.addColorStop(0, 'rgba(255,255,255,0.3)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
            rrPath(ctx, 8, 6, 424, 44, 18);
            ctx.fillStyle = gloss; ctx.fill();
        });

        // ---- Outline button (440x100) ----
        this.ct('btnOutline', 440, 100, (ctx) => {
            rrPath(ctx, 2, 2, 436, 96, 24);
            ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 3; ctx.stroke();
            // Subtle fill
            ctx.fillStyle = 'rgba(76,175,80,0.08)'; ctx.fill();
        });

        // ---- Answer cards (200x120) — frosted glass ----
        this.ct('answerCard', 200, 120, (ctx) => {
            rrPath(ctx, 0, 0, 200, 120, 24);
            const bg = ctx.createLinearGradient(0, 0, 0, 120);
            bg.addColorStop(0, 'rgba(255,255,255,0.16)'); bg.addColorStop(1, 'rgba(255,255,255,0.04)');
            ctx.fillStyle = bg; ctx.fill();
            // Top highlight
            const hi = ctx.createLinearGradient(0, 0, 0, 10);
            hi.addColorStop(0, 'rgba(255,255,255,0.3)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
            rrPath(ctx, 3, 3, 194, 15, {tl:20, tr:20, bl:0, br:0});
            ctx.fillStyle = hi; ctx.fill();
            // Bottom shadow
            const sh = ctx.createLinearGradient(0, 104, 0, 120);
            sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.1)');
            rrPath(ctx, 3, 104, 194, 16, {tl:0, tr:0, bl:20, br:20});
            ctx.fillStyle = sh; ctx.fill();
            // Border
            rrPath(ctx, 1.5, 1.5, 197, 117, 23);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
        });

        this.ct('answerCorrect', 200, 120, (ctx) => {
            rrPath(ctx, 0, 0, 200, 120, 24);
            const bg = ctx.createLinearGradient(0, 0, 0, 120);
            bg.addColorStop(0, 'rgba(76,175,80,0.6)'); bg.addColorStop(1, 'rgba(46,125,50,0.4)');
            ctx.fillStyle = bg; ctx.fill();
            // Glow
            const glow = ctx.createRadialGradient(100, 60, 10, 100, 60, 80);
            glow.addColorStop(0, 'rgba(255,255,255,0.15)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = glow; ctx.fill();
            rrPath(ctx, 1.5, 1.5, 197, 117, 23);
            ctx.strokeStyle = 'rgba(102,187,106,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        });

        this.ct('answerWrong', 200, 120, (ctx) => {
            rrPath(ctx, 0, 0, 200, 120, 24);
            const bg = ctx.createLinearGradient(0, 0, 0, 120);
            bg.addColorStop(0, 'rgba(230,57,70,0.6)'); bg.addColorStop(1, 'rgba(180,40,50,0.4)');
            ctx.fillStyle = bg; ctx.fill();
            rrPath(ctx, 1.5, 1.5, 197, 117, 23);
            ctx.strokeStyle = 'rgba(230,57,70,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        });

        // ---- HUD circle (72x72) with radial gradient ----
        this.ct('hudCircle', 72, 72, (ctx) => {
            const grad = ctx.createRadialGradient(36, 30, 5, 36, 36, 34);
            grad.addColorStop(0, '#4caf50'); grad.addColorStop(1, '#1b5e20');
            ctx.beginPath(); ctx.arc(36, 36, 34, 0, Math.PI*2);
            ctx.fillStyle = grad; ctx.fill();
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.stroke();
        });

        // ---- Grade badge (80x80 circle) ----
        this.ct('gradeBadge', 80, 80, (ctx) => {
            const grad = ctx.createRadialGradient(40, 35, 5, 40, 40, 38);
            grad.addColorStop(0, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, 'rgba(255,255,255,0.03)');
            ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI*2);
            ctx.fillStyle = grad; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
        });

        this.ct('gradeBadgeSel', 80, 80, (ctx) => {
            const grad = ctx.createRadialGradient(40, 35, 5, 40, 40, 38);
            grad.addColorStop(0, 'rgba(255,215,0,0.35)'); grad.addColorStop(1, 'rgba(255,215,0,0.08)');
            ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI*2);
            ctx.fillStyle = grad; ctx.fill();
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5; ctx.stroke();
        });

        g.destroy();
        this.scene.start('Profile');
    }

    starPts(cx,cy,ro,ri,n) {
        const pts = [];
        for (let i=0;i<n*2;i++){const a=(i*Math.PI/n)-Math.PI/2; const r=i%2===0?ro:ri; pts.push(new Phaser.Geom.Point(cx+Math.cos(a)*r,cy+Math.sin(a)*r));}
        return pts;
    }
}

// ============================================================
//  PROFILE SCENE — Open soccer field layout, no boxes
// ============================================================
class ProfileScene extends Phaser.Scene {
    constructor() { super('Profile'); }

    create() {
        this.cameras.main.setZoom(DPR);
        this.cameras.main.centerOn(W/2, H/2);
        this.cameras.main.setRoundPixels(true);

        // Full field background
        drawField(this);
        drawClouds(this);
        // Faded goal in background
        drawGoal(this).setAlpha(0.3);

        // ---- Title in the sky ----
        this.add.text(W/2, 38, 'SOCCER MATH KICK', ts({
            fontSize:'32px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff',
            stroke:'#1d3557', strokeThickness:5
        })).setOrigin(0.5).setDepth(5);
        this.add.text(W/2, 68, 'Score goals with your brain!', ts({
            fontSize:'12px', fontFamily:'Arial, sans-serif', color:'#e0e8f0'
        })).setOrigin(0.5).setDepth(5);

        // ---- Name Input — floating on field, underline style ----
        this.add.text(W/2, 152, 'YOUR NAME', ts({
            fontSize:'10px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffd700', letterSpacing:3
        })).setOrigin(0.5).setDepth(5);

        // Underline input
        this.inputLine = this.add.graphics().setDepth(5);
        this.drawInputLine(false);

        // Hit area for input
        const inputZone = this.add.zone(W/2, 180, 260, 36).setInteractive({ useHandCursor: true }).setDepth(5);

        this.nameDisplayText = this.add.text(W/2, 178, 'Tap to enter name...', ts({
            fontSize:'16px', fontFamily:'Arial, sans-serif', color:'rgba(255,255,255,0.4)'
        })).setOrigin(0.5).setDepth(5);

        this.nameCursor = this.add.text(W/2, 178, '|', ts({
            fontSize:'16px', fontFamily:'Arial, sans-serif', color:'#ffffff'
        })).setOrigin(0.5).setAlpha(0).setDepth(5);

        this.nameValue = '';
        this.nameActive = false;

        // Hidden HTML input to trigger on-screen keyboard on touch devices (iPad, phones)
        this.hiddenInput = document.createElement('input');
        this.hiddenInput.type = 'text';
        this.hiddenInput.maxLength = 15;
        this.hiddenInput.autocomplete = 'name';
        this.hiddenInput.autocapitalize = 'words';
        this.hiddenInput.setAttribute('enterkeyhint', 'done');
        Object.assign(this.hiddenInput.style, {
            position:'absolute', left:'-9999px', top:'0', width:'1px', height:'1px',
            opacity:'0', fontSize:'16px', zIndex:'-1'
        });
        document.body.appendChild(this.hiddenInput);

        // Restore saved player data
        const hasSaved = loadPlayer();
        if (hasSaved && playerData.name) {
            this.nameValue = playerData.name;
            this.hiddenInput.value = playerData.name;
            this.updateNameDisplay();
        }

        const activateInput = () => {
            this.nameActive = true;
            this.drawInputLine(true);
            this.hiddenInput.value = this.nameValue;
            this.hiddenInput.focus();
        };

        inputZone.on('pointerdown', activateInput);

        // Sync hidden input → Phaser display
        this.hiddenInput.addEventListener('input', () => {
            this.nameValue = this.hiddenInput.value.slice(0, 15);
            this.updateNameDisplay();
            this.checkReady();
        });

        // Handle Done / Enter on virtual keyboard
        this.hiddenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                this.hiddenInput.blur();
            }
        });

        // When hidden input loses focus, deactivate
        this.hiddenInput.addEventListener('blur', () => {
            this.nameActive = false;
            this.nameCursor.setAlpha(0);
            this.drawInputLine(false);
        });

        // Tap outside name area → blur
        this.input.on('pointerdown', (pointer) => {
            const wx = pointer.worldX, wy = pointer.worldY;
            if (wx < W/2-130 || wx > W/2+130 || wy < 162 || wy > 198) {
                this.hiddenInput.blur();
            }
        });

        this.time.addEvent({ delay:500, loop:true, callback:() => { if(this.nameActive) this.nameCursor.setAlpha(this.nameCursor.alpha>0?0:1); }});

        // ---- Grade Selection — circular badges ----
        this.add.text(W/2, 212, 'PICK YOUR GRADE', ts({
            fontSize:'10px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffd700', letterSpacing:3
        })).setOrigin(0.5).setDepth(5);

        this.gradeButtons = [];
        this.selectedGrade = 0;
        const grades = ['1st','2nd','3rd','4th','5th'];
        const gStartX = W/2 - 120;
        grades.forEach((label, i) => {
            const x = gStartX + i*60, y = 250;
            const badge = this.add.image(x, y, 'gradeBadge').setScale(0.6).setDepth(5);
            const txt = this.add.text(x, y, label, ts({ fontSize:'14px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff' })).setOrigin(0.5).setDepth(6);
            // Larger invisible tap zone for touch devices (50×50)
            const tapZone = this.add.zone(x, y, 56, 56).setInteractive({ useHandCursor:true }).setDepth(7);
            const selectGrade = () => {
                SFX.click(); this.selectedGrade = i+1;
                this.gradeButtons.forEach(gb => { gb.badge.setTexture('gradeBadge').setScale(0.6); });
                badge.setTexture('gradeBadgeSel');
                this.tweens.add({ targets:[badge,txt], scaleX:0.66, scaleY:0.66, duration:120, yoyo:true });
                this.checkReady();
            };
            tapZone.on('pointerdown', selectGrade);
            tapZone.on('pointerover', () => { if(this.selectedGrade!==i+1) badge.setAlpha(0.8); });
            tapZone.on('pointerout', () => badge.setAlpha(1));
            this.gradeButtons.push({ badge, txt, grade:i+1 });
        });

        // ---- Avatar Selection — characters on the field ----
        this.add.text(W/2, 290, 'CHOOSE YOUR PLAYER', ts({
            fontSize:'10px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffd700', letterSpacing:3
        })).setOrigin(0.5).setDepth(5);

        this.avatarButtons = [];
        this.selectedAvatar = -1;
        this.avatarGlows = [];
        const avStartX = W/2 - (AVATARS.length-1)*42;
        AVATARS.forEach((av, i) => {
            const x = avStartX + i*84;
            const y = 370;
            // Ground shadow
            const shadow = this.add.graphics().setDepth(4);
            shadow.fillStyle(0x000000, 0.15); shadow.fillEllipse(x, y+36, 40, 8);
            // Spotlight glow (hidden by default)
            const glow = this.add.graphics().setDepth(3).setAlpha(0);
            glow.fillStyle(0xffd700, 0.2); glow.fillCircle(x, y+10, 35);
            glow.fillStyle(0xffd700, 0.1); glow.fillCircle(x, y+10, 50);
            this.avatarGlows.push(glow);

            const sprite = this.add.image(x, y, 'avatar_'+i).setScale(0.55).setDepth(5);
            // Larger invisible tap zone for touch devices (70×80)
            const tapZone = this.add.zone(x, y+5, 70, 80).setInteractive({ useHandCursor:true }).setDepth(7);

            tapZone.on('pointerdown', () => {
                SFX.click(); this.selectedAvatar = i;
                this.avatarGlows.forEach(gl => gl.setAlpha(0));
                glow.setAlpha(1);
                this.avatarButtons.forEach(ab => ab.sprite.setScale(0.55));
                this.tweens.add({ targets:sprite, scaleX:0.65, scaleY:0.65, duration:200, ease:'Back.easeOut' });
                this.checkReady();
            });
            tapZone.on('pointerover', () => {
                if (this.selectedAvatar !== i) this.tweens.add({ targets:sprite, scaleX:0.6, scaleY:0.6, duration:100 });
            });
            tapZone.on('pointerout', () => {
                if (this.selectedAvatar !== i) this.tweens.add({ targets:sprite, scaleX:0.55, scaleY:0.55, duration:100 });
            });
            this.avatarButtons.push({ sprite, shadow, glow, idx:i });
        });

        // ---- Start Button ----
        this.startBtn = this.add.image(W/2, 460, 'btnGreen').setScale(0.45).setInteractive({ useHandCursor:true }).setAlpha(0.35).setDepth(5);
        this.startTxt = this.add.text(W/2, 460, "LET'S PLAY!", ts({
            fontSize:'17px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff'
        })).setOrigin(0.5).setDepth(5);

        this.startBtn.on('pointerdown', () => {
            if (!this.isReady) return;
            SFX.click();
            this.tweens.add({ targets:this.startBtn, y:463, duration:80, yoyo:true });
            playerData.name = this.nameValue.trim() || 'Player';
            playerData.grade = this.selectedGrade;
            playerData.avatarIdx = this.selectedAvatar;
            savePlayer();
            this.cameras.main.flash(200, 255, 255, 255);
            this.time.delayedCall(200, () => {
                this.cameras.main.fadeOut(300, 0, 0, 0);
                this.time.delayedCall(300, () => this.scene.start('Game'));
            });
        });
        this.startBtn.on('pointerover', () => { if(this.isReady) this.startBtn.setAlpha(1); });
        this.startBtn.on('pointerout', () => { if(this.isReady) this.startBtn.setAlpha(0.85); });
        this.isReady = false;

        // Restore saved grade & avatar selections (must be after startBtn is created)
        if (hasSaved) {
            if (playerData.grade >= 1 && playerData.grade <= 5) {
                this.selectedGrade = playerData.grade;
                const gb = this.gradeButtons[playerData.grade - 1];
                if (gb) gb.badge.setTexture('gradeBadgeSel');
            }
            if (playerData.avatarIdx >= 0 && playerData.avatarIdx < AVATARS.length) {
                this.selectedAvatar = playerData.avatarIdx;
                const ab = this.avatarButtons[playerData.avatarIdx];
                if (ab) { ab.glow.setAlpha(1); ab.sprite.setScale(0.65); }
            }
            this.checkReady();
        }

        this.add.text(W/2, 498, '\u26bd Tap the answer to kick!', ts({
            fontSize:'10px', fontFamily:'Arial, sans-serif', color:'rgba(255,255,255,0.5)'
        })).setOrigin(0.5).setDepth(5);

        drawVignette(this);
        this.cameras.main.fadeIn(400);

        this.events.on('shutdown', () => {
            if (this.hiddenInput && this.hiddenInput.parentNode) {
                this.hiddenInput.blur();
                this.hiddenInput.parentNode.removeChild(this.hiddenInput);
            }
        });
    }

    drawInputLine(active) {
        this.inputLine.clear();
        this.inputLine.lineStyle(active ? 2.5 : 1.5, active ? 0xffd700 : 0xffffff, active ? 0.9 : 0.3);
        this.inputLine.lineBetween(W/2-120, 192, W/2+120, 192);
    }

    updateNameDisplay() {
        if (this.nameValue.length > 0) {
            this.nameDisplayText.setText(this.nameValue).setColor('#ffffff');
        } else {
            this.nameDisplayText.setText('Tap to enter name...').setColor('rgba(255,255,255,0.4)');
        }
        const tw = this.nameDisplayText.width;
        this.nameCursor.setPosition(W/2 + tw/2 + 2, 178);
    }

    checkReady() {
        this.isReady = this.nameValue.trim().length > 0 && this.selectedGrade > 0 && this.selectedAvatar >= 0;
        this.startBtn.setAlpha(this.isReady ? 0.85 : 0.35);
    }
}

// ============================================================
//  GAME SCENE
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super('Game'); }

    create() {
        this.cameras.main.setZoom(DPR);
        this.cameras.main.centerOn(W/2, H/2);
        this.cameras.main.setRoundPixels(true);
        this.answering = false;
        this.gameActive = true;
        this.timeLeft = GAME_TIME;
        playerData.score = 0; playerData.streak = 0; playerData.bestStreak = 0;
        playerData.correct = 0; playerData.wrong = 0;

        // ---- Background ----
        drawField(this);
        drawFieldMarkings(this);
        drawClouds(this);
        drawGoal(this);

        // ---- Goalkeeper ----
        this.keeperBaseX = W/2;
        this.keeperBaseY = 205;
        this.keeper = this.add.image(this.keeperBaseX, this.keeperBaseY, 'goalkeeper').setScale(0.45).setDepth(3);
        this.keeperShadow = this.add.graphics().setDepth(2);
        this.keeperShadow.fillStyle(0x000000, 0.15);
        this.keeperShadow.fillEllipse(this.keeperBaseX, this.keeperBaseY + 28, 35, 7);
        // Idle sway
        this.keeperIdleTween = this.tweens.add({
            targets: this.keeper, x: this.keeperBaseX - 10,
            duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        // ---- HUD (gradient bar) ----
        const hud = this.add.graphics().setDepth(10);
        hud.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x1a2a3a, 0x1a2a3a, 0.92, 0.92, 0.75, 0.75);
        hud.fillRect(0, 0, W, 48);
        hud.fillGradientStyle(0xffd700, 0xffd700, 0xffd700, 0xffd700, 0.25, 0.25, 0, 0);
        hud.fillRect(0, 46, W, 2);

        this.add.image(28, 24, 'hudCircle').setScale(0.5).setDepth(10);
        if (playerData.avatarIdx >= 0) this.add.image(28, 24, 'avatar_'+playerData.avatarIdx).setScale(0.28).setDepth(10);
        this.add.text(52, 24, playerData.name, ts({ fontSize:'14px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffffff' })).setOrigin(0, 0.5).setDepth(10);

        this.add.text(W/2-60, 12, 'SCORE', ts({ fontSize:'9px', fontFamily:'Arial, sans-serif', color:'#adb5bd', letterSpacing:1 })).setOrigin(0.5, 0).setDepth(10);
        this.scoreText = this.add.text(W/2-60, 33, '0', ts({ fontSize:'20px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffd700' })).setOrigin(0.5, 0.5).setDepth(10);

        this.add.text(W/2+40, 12, 'STREAK', ts({ fontSize:'9px', fontFamily:'Arial, sans-serif', color:'#adb5bd', letterSpacing:1 })).setOrigin(0.5, 0).setDepth(10);
        this.streakText = this.add.text(W/2+40, 33, '0', ts({ fontSize:'20px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ff6b35' })).setOrigin(0.5, 0.5).setDepth(10);

        this.add.text(W-120, 12, 'TIME', ts({ fontSize:'9px', fontFamily:'Arial, sans-serif', color:'#adb5bd', letterSpacing:1 })).setOrigin(0.5, 0).setDepth(10);
        const timerBg = this.add.graphics().setDepth(10); timerBg.fillStyle(0xffffff, 0.15); timerBg.fillRoundedRect(W-170, 27, 100, 10, 5);
        this.timerBar = this.add.graphics().setDepth(10);
        this.timerText = this.add.text(W-55, 32, '60s', ts({ fontSize:'14px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffffff' })).setOrigin(0.5, 0.5).setDepth(10);

        // ---- Exit button (top-right) ----
        const exitBtn = this.add.text(W-16, 24, '\u2715', ts({
            fontSize:'16px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'rgba(255,255,255,0.4)'
        })).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor:true });
        exitBtn.on('pointerover', () => exitBtn.setColor('#ffffff'));
        exitBtn.on('pointerout', () => exitBtn.setColor('rgba(255,255,255,0.4)'));
        exitBtn.on('pointerdown', () => {
            SFX.click();
            this.gameActive = false;
            if (this.timerEvent) this.timerEvent.remove();
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.time.delayedCall(300, () => this.scene.start('Profile'));
        });

        // ---- Equation Banner ----
        const banner = this.add.graphics().setDepth(5);
        banner.fillGradientStyle(0x1d3557, 0x1d3557, 0x152a45, 0x152a45, 0.95, 0.95, 0.9, 0.9);
        banner.fillRect(0, 48, W, 55);
        banner.fillGradientStyle(0xffd700, 0xffd700, 0xffd700, 0xffd700, 0.6, 0.6, 0, 0);
        banner.fillRect(0, 102, W, 3);
        this.equationText = this.add.text(W/2, 75, '', ts({ fontSize:'30px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff', stroke:'#0d1b2a', strokeThickness:3, letterSpacing:3 })).setOrigin(0.5).setDepth(6);

        this.answerCards = [];

        // ---- Player sprite (at penalty spot area) ----
        const playerY = 480;
        // Player shadow
        this.playerShadow = this.add.graphics().setDepth(3);
        this.playerShadow.fillStyle(0x000000, 0.15);
        this.playerShadow.fillEllipse(W/2, playerY+38, 50, 10);
        this.playerSprite = this.add.image(W/2, playerY, 'avatar_'+Math.max(0, playerData.avatarIdx)).setScale(0.7).setDepth(4);

        // ---- Soccer ball (at player's feet) ----
        const ballY = playerY + 50;
        this.ball = this.physics.add.image(W/2, ballY, 'ball').setScale(0.5);
        this.ball.body.setAllowGravity(false); this.ball.setDepth(8);
        this.tweens.add({ targets: this.ball, y: this.ball.y-5, duration:500, yoyo:true, repeat:-1, ease:'Sine.easeInOut' });

        // Ball shadow
        this.ballShadow = this.add.graphics().setDepth(3);

        // ---- Spark trail emitter ----
        this.sparkEmitter = this.add.particles(0, 0, 'particle', {
            speed:{min:20,max:60}, scale:{start:0.35,end:0}, lifespan:250,
            tint:[0xffd700, 0xff6b35, 0xffffff], emitting:false, quantity:2, frequency:30
        }).setDepth(7);

        // ---- Feedback ----
        this.feedbackText = this.add.text(W/2, H/2, '', ts({ fontSize:'52px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#4caf50', stroke:'#000000', strokeThickness:6 })).setOrigin(0.5).setAlpha(0).setDepth(20);
        this.feedbackIcon = this.add.text(W/2, H/2-60, '', ts({ fontSize:'64px' })).setOrigin(0.5).setAlpha(0).setDepth(20);

        // ---- Confetti ----
        this.confettiEmitter = this.add.particles(0, 0, 'particle', {
            speed:{min:100,max:350}, angle:{min:220,max:320}, scale:{start:0.8,end:0},
            lifespan:2000, gravityY:250, tint:[0xffd700,0xe63946,0x4caf50,0x457b9d,0xff6b35,0x9b5de5],
            emitting:false, quantity:30
        }).setDepth(25);

        // ---- Vignette ----
        drawVignette(this);

        // ---- Keyboard ----
        this.input.keyboard.on('keydown', (e) => {
            if(!this.gameActive||this.answering) return;
            const k = parseInt(e.key);
            if(k>=1&&k<=4&&this.answerCards[k-1]) this.handleAnswer(this.answerCards[k-1].value, this.answerCards[k-1]);
        });

        this.cameras.main.fadeIn(600);
        SFX.whistle();
        this.time.delayedCall(500, () => this.nextQuestion());
        this.timerEvent = this.time.addEvent({ delay:1000, callback:this.tickTimer, callbackScope:this, repeat:GAME_TIME-1 });
    }

    tickTimer() {
        this.timeLeft--;
        const pct = this.timeLeft / GAME_TIME;
        this.timerBar.clear();
        let color = 0x4caf50;
        if(pct<=0.2) color = 0xe63946; else if(pct<=0.4) color = 0xff6b35;
        this.timerBar.fillStyle(color); this.timerBar.fillRoundedRect(W-170, 27, 100*pct, 10, 5);
        this.timerText.setText(this.timeLeft+'s');
        if(pct<=0.2) this.tweens.add({targets:this.timerText, alpha:0.4, duration:200, yoyo:true});
        if(this.timeLeft<=0) this.endGame();
    }

    updateHUD() {
        this.scoreText.setText(playerData.score.toString());
        this.streakText.setText(playerData.streak.toString());
        this.tweens.add({ targets:this.scoreText, scaleX:1.3, scaleY:1.3, duration:100, yoyo:true, ease:'Back.easeOut' });
        // Glow flash
        this.scoreText.setTint(0xffff00);
        this.time.delayedCall(250, () => this.scoreText.clearTint());
        if (playerData.streak >= 3) {
            this.streakText.setTint(0xff4400);
            this.time.delayedCall(300, () => this.streakText.setTint(0xff6b35));
        }
    }

    nextQuestion() {
        if(!this.gameActive) return;
        this.answering = false;
        const eq = generateEquation(playerData.grade);
        this.currentAnswer = eq.answer;

        this.equationText.setText(eq.text).setAlpha(0).setScale(0.5);
        this.tweens.add({ targets:this.equationText, alpha:1, scaleX:1, scaleY:1, duration:300, ease:'Back.easeOut' });

        // Cleanup old cards
        this.answerCards.forEach(c => {
            if(c.card)c.card.destroy(); if(c.txt)c.txt.destroy();
            if(c.numKey)c.numKey.destroy(); if(c.shadow)c.shadow.destroy();
        });
        this.answerCards = [];

        const choices = generateChoices(eq.answer);
        const startX = W/2 - (choices.length-1)*60;
        choices.forEach((val, i) => {
            const x = startX + i*120, y = 250;

            // Drop shadow
            const shadow = this.add.graphics().setDepth(4);
            shadow.fillStyle(0x000000, 0.2);
            shadow.fillRoundedRect(x-48, y-26, 96, 56, 12);
            shadow.setAlpha(0);

            const card = this.add.image(x, y, 'answerCard').setScale(0, 0).setInteractive({ useHandCursor:true }).setDepth(5);
            const txt = this.add.text(x, y-3, val.toString(), ts({ fontSize:'22px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff' })).setOrigin(0.5).setAlpha(0).setDepth(5);
            const numKey = this.add.text(x, y+22, (i+1).toString(), ts({ fontSize:'10px', fontFamily:'Arial, sans-serif', color:'#adb5bd' })).setOrigin(0.5).setAlpha(0).setDepth(5);

            this.tweens.add({ targets:shadow, alpha:0.2, duration:300, delay:i*80 });
            this.tweens.add({ targets:card, scaleX:0.5, scaleY:0.5, duration:300, delay:i*80, ease:'Back.easeOut' });
            this.tweens.add({ targets:[txt, numKey], alpha:1, duration:200, delay:i*80+150 });

            // Hover lift
            card.on('pointerover', () => {
                if(this.answering) return;
                this.tweens.add({targets:card, scaleX:0.55, scaleY:0.55, y:y-5, duration:120});
                this.tweens.add({targets:shadow, alpha:0.35, duration:120});
            });
            card.on('pointerout', () => {
                if(this.answering) return;
                this.tweens.add({targets:card, scaleX:0.5, scaleY:0.5, y:y, duration:120});
                this.tweens.add({targets:shadow, alpha:0.2, duration:120});
            });
            card.on('pointerdown', () => this.handleAnswer(val, this.answerCards[i]));

            this.answerCards.push({ card, txt, numKey, shadow, value:val, x, y });
        });

        this.ball.setPosition(W/2, 530).setAlpha(1).setScale(0.5).setRotation(0);
        this.ballShadow.clear();
    }

    handleAnswer(chosen, cardObj) {
        if(this.answering||!this.gameActive) return;
        this.answering = true;
        SFX.kick();
        const isCorrect = chosen === this.currentAnswer;

        // Highlight the selected card immediately
        cardObj.card.setTexture(isCorrect ? 'answerCorrect' : 'answerWrong');

        this.tweens.add({ targets:this.playerSprite, angle:-15, duration:150, yoyo:true, ease:'Quad.easeOut' });

        // Ball arcs toward the goal mouth (not the card)
        this.tweens.killTweensOf(this.ball);
        const sX = this.ball.x, sY = this.ball.y;
        const eX = W/2 + Phaser.Math.Between(-50, 50);
        const eY = 180; // center of goal mouth
        const midY = Math.min(sY, eY) - 100;
        const dur = 500;

        this.sparkEmitter.startFollow(this.ball);
        this.sparkEmitter.start();

        this.tweens.add({
            targets: { t: 0 }, t: 1, duration: dur, ease: 'Linear',
            onUpdate: (tw, target) => {
                const t = target.t;
                const x = Phaser.Math.Linear(sX, eX, t);
                const y = (1-t)*(1-t)*sY + 2*(1-t)*t*midY + t*t*eY;
                this.ball.setPosition(x, y);
                this.ball.setRotation(t * Math.PI*3);
                const hf = 1 - 0.25 * Math.sin(t * Math.PI);
                this.ball.setScale(0.5 * hf);
                this.ballShadow.clear();
                this.ballShadow.fillStyle(0x000000, 0.1 * hf);
                this.ballShadow.fillEllipse(x, sY+5, 18*hf, 5*hf);
            },
            onComplete: () => {
                this.sparkEmitter.stop();
                this.sparkEmitter.stopFollow();
                this.ballShadow.clear();
                if(isCorrect) this.onCorrect(cardObj); else this.onWrong(cardObj);
            }
        });
    }

    onCorrect(cardObj) {
        playerData.score += 10 + playerData.streak*2; playerData.streak++;
        if(playerData.streak > playerData.bestStreak) playerData.bestStreak = playerData.streak;
        playerData.correct++;
        SFX.goal();
        if(playerData.streak>0 && playerData.streak%3===0) SFX.streak();
        if(playerData.correct%5===0) SFX.goalMusic();
        this.updateHUD(); this.showFeedback(true);

        // Keeper dives the WRONG way — ball scores!
        this.tweens.killTweensOf(this.keeper);
        const diveDir = (this.ball.x >= this.keeperBaseX) ? -1 : 1; // dive opposite to ball
        this.tweens.add({
            targets: this.keeper,
            x: this.keeperBaseX + diveDir * 80,
            angle: diveDir * 30,
            duration: 300, ease: 'Quad.easeOut'
        });

        // Ball slides deeper into the net
        this.tweens.add({
            targets: this.ball,
            y: this.ball.y - 25, scaleX: 0.3, scaleY: 0.3, alpha: 0.4,
            duration: 350, ease: 'Quad.easeIn'
        });

        // Confetti at goal mouth
        this.confettiEmitter.setPosition(W/2, 170); this.confettiEmitter.explode(25);
        this.cameras.main.shake(200, 0.005);
        this.cameras.main.zoomTo(DPR*1.02, 150, 'Quad.easeOut', false, (cam, p) => {
            if(p===1) this.cameras.main.zoomTo(DPR, 200, 'Quad.easeIn');
        });

        // Glow ring at goal
        const glow = this.add.graphics().setDepth(19);
        glow.lineStyle(3, 0x4caf50, 0.7); glow.strokeCircle(this.ball.x, 180, 25);
        this.tweens.add({ targets:glow, scaleX:2.5, scaleY:2.5, alpha:0, duration:500, ease:'Quad.easeOut', onComplete:()=>glow.destroy() });

        if(playerData.streak>=3) {
            const star = this.add.image(W/2, H/2, 'star').setScale(0).setDepth(20);
            this.tweens.add({ targets:star, scaleX:1.5, scaleY:1.5, alpha:0, angle:360, duration:800, ease:'Quad.easeOut', onComplete:()=>star.destroy() });
        }

        this.time.delayedCall(1000, () => { this.resetKeeper(); this.nextQuestion(); });
    }

    onWrong(cardObj) {
        playerData.streak = 0; playerData.wrong++;
        SFX.miss(); this.updateHUD(); this.showFeedback(false);

        // Wrong card shakes
        this.tweens.add({ targets:[cardObj.card, cardObj.txt], x:cardObj.x+8, duration:50, yoyo:true, repeat:3 });
        // Highlight correct answer
        this.answerCards.forEach(c => {
            if(c.value===this.currentAnswer) { c.card.setTexture('answerCorrect'); this.tweens.add({targets:c.card, scaleX:0.58, scaleY:0.58, duration:200, yoyo:true, repeat:1}); }
        });

        // Keeper dives TOWARD the ball and catches it!
        this.tweens.killTweensOf(this.keeper);
        const ballSide = this.ball.x < this.keeperBaseX ? -1 : (this.ball.x > this.keeperBaseX ? 1 : 0);
        this.tweens.add({
            targets: this.keeper,
            x: this.ball.x,
            angle: ballSide * -25,
            duration: 250, ease: 'Quad.easeOut'
        });

        // Ball shrinks (caught by keeper)
        this.tweens.add({
            targets: this.ball,
            scaleX: 0.25, scaleY: 0.25, alpha: 0.5,
            duration: 300, ease: 'Quad.easeOut'
        });

        this.time.delayedCall(1200, () => { this.resetKeeper(); this.nextQuestion(); });
    }

    resetKeeper() {
        this.tweens.killTweensOf(this.keeper);
        this.tweens.add({
            targets: this.keeper,
            x: this.keeperBaseX, y: this.keeperBaseY, angle: 0,
            duration: 400, ease: 'Quad.easeOut',
            onComplete: () => {
                this.keeperIdleTween = this.tweens.add({
                    targets: this.keeper, x: this.keeperBaseX - 10,
                    duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
        });
        this.keeperShadow.clear();
        this.keeperShadow.fillStyle(0x000000, 0.15);
        this.keeperShadow.fillEllipse(this.keeperBaseX, this.keeperBaseY + 28, 35, 7);
    }

    showFeedback(correct) {
        const msgs = correct ? ['GOAL!','GREAT!','AWESOME!','SUPERB!','NICE KICK!'] : ['SAVED!','BLOCKED!','CAUGHT!','TRY AGAIN!'];
        const msg = msgs[Math.floor(Math.random()*msgs.length)];
        this.feedbackIcon.setText(correct?'\u26bd':'\u270b').setAlpha(1).setScale(0.3).setPosition(W/2, H/2-50);
        this.feedbackText.setText(msg).setColor(correct?'#4caf50':'#e63946').setAlpha(1).setScale(0.3).setPosition(W/2, H/2+20);
        this.tweens.add({
            targets:[this.feedbackIcon, this.feedbackText], scaleX:1, scaleY:1, duration:200, ease:'Back.easeOut',
            onComplete: () => { this.tweens.add({ targets:[this.feedbackIcon, this.feedbackText], alpha:0, y:'-=40', duration:500, delay:200, ease:'Quad.easeIn' }); }
        });
    }

    endGame() {
        this.gameActive = false;
        if(this.timerEvent) this.timerEvent.remove();
        SFX.gameOver();
        this.answerCards.forEach(c => { if(c.card) c.card.disableInteractive(); });
        this.cameras.main.flash(300, 255, 255, 255);
        this.cameras.main.zoomTo(DPR*1.08, 800, 'Quad.easeIn');
        this.time.delayedCall(1500, () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.time.delayedCall(500, () => this.scene.start('GameOver'));
        });
    }

    update() {
        if(this.timerBar && this.timeLeft===GAME_TIME) {
            this.timerBar.clear(); this.timerBar.fillStyle(0x4caf50); this.timerBar.fillRoundedRect(W-170,27,100,10,5);
        }
    }
}

// ============================================================
//  GAME OVER SCENE — Open field, floating results
// ============================================================
class GameOverScene extends Phaser.Scene {
    constructor() { super('GameOver'); }

    create() {
        this.cameras.main.setZoom(DPR);
        this.cameras.main.centerOn(W/2, H/2);
        this.cameras.main.setRoundPixels(true);

        // Field background
        drawField(this);
        drawClouds(this);
        drawGoal(this).setAlpha(0.25);

        const pct = playerData.correct / Math.max(1, playerData.correct + playerData.wrong);
        let title, titleColor;
        if(pct>=0.9){title='CHAMPION! \u{1F3C6}';titleColor='#ffd700';}
        else if(pct>=0.7){title='GREAT MATCH!';titleColor='#66bb6a';}
        else if(pct>=0.5){title='FULL TIME!';titleColor='#ffd700';}
        else{title='KEEP PRACTICING!';titleColor='#ff6b35';}

        // Title in sky
        const titleText = this.add.text(W/2, 50, title, ts({ fontSize:'34px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:titleColor, stroke:'#0d1b2a', strokeThickness:5 })).setOrigin(0.5).setScale(0).setDepth(5);
        this.tweens.add({ targets:titleText, scaleX:1, scaleY:1, duration:500, ease:'Back.easeOut' });

        // Avatar on the field with spotlight
        if(playerData.avatarIdx>=0) {
            // Spotlight
            const spot = this.add.graphics().setDepth(3);
            spot.fillStyle(0xffd700, 0.12); spot.fillCircle(W/2, 200, 50);
            spot.fillStyle(0xffd700, 0.06); spot.fillCircle(W/2, 200, 80);
            // Shadow
            const avShadow = this.add.graphics().setDepth(3);
            avShadow.fillStyle(0x000000, 0.15); avShadow.fillEllipse(W/2, 240, 55, 10);

            this.add.image(W/2, 200, 'avatar_'+playerData.avatarIdx).setScale(0.8).setDepth(5);
        }
        this.add.text(W/2, 260, playerData.name, ts({ fontSize:'16px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#ffffff', stroke:'#000000', strokeThickness:3 })).setOrigin(0.5).setDepth(5);

        // Score
        const scoreNum = this.add.text(W/2, 310, '0', ts({ fontSize:'58px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffd700', stroke:'#000000', strokeThickness:4 })).setOrigin(0.5).setDepth(5);
        this.add.text(W/2, 348, 'GOALS SCORED', ts({ fontSize:'11px', fontFamily:'Arial, sans-serif', color:'#e0e8f0', letterSpacing:3 })).setOrigin(0.5).setDepth(5);
        this.tweens.addCounter({ from:0, to:playerData.score, duration:1500, ease:'Quad.easeOut', onUpdate:(tw)=>scoreNum.setText(Math.floor(tw.getValue()).toString()) });

        // Stats row
        const stats = [
            {label:'CORRECT',value:playerData.correct,color:'#4caf50'},
            {label:'MISSED',value:playerData.wrong,color:'#e63946'},
            {label:'BEST STREAK',value:playerData.bestStreak,color:'#ff6b35'},
        ];
        stats.forEach((s,i) => {
            const x = W/2-120+i*120, y = 395;
            this.add.text(x, y, s.value.toString(), ts({ fontSize:'28px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:s.color, stroke:'#000000', strokeThickness:3 })).setOrigin(0.5).setDepth(5);
            this.add.text(x, y+22, s.label, ts({ fontSize:'8px', fontFamily:'Arial, sans-serif', color:'#e0e8f0', letterSpacing:1 })).setOrigin(0.5).setDepth(5);
        });

        // Buttons
        const replayBtn = this.add.image(W/2, 460, 'btnGreen').setScale(0.45).setInteractive({ useHandCursor:true }).setDepth(5);
        this.add.text(W/2, 460, 'PLAY AGAIN', ts({ fontSize:'15px', fontFamily:'Arial Black, sans-serif', fontStyle:'bold', color:'#ffffff' })).setOrigin(0.5).setDepth(5);
        replayBtn.on('pointerdown', () => { SFX.click(); this.tweens.add({targets:replayBtn,y:463,duration:80,yoyo:true}); this.cameras.main.fadeOut(300,0,0,0); this.time.delayedCall(300, () => this.scene.start('Game')); });
        replayBtn.on('pointerover', () => replayBtn.setAlpha(0.85)); replayBtn.on('pointerout', () => replayBtn.setAlpha(1));

        const menuBtn = this.add.image(W/2, 510, 'btnOutline').setScale(0.45).setInteractive({ useHandCursor:true }).setDepth(5);
        this.add.text(W/2, 510, 'CHANGE PLAYER', ts({ fontSize:'12px', fontFamily:'Arial, sans-serif', fontStyle:'bold', color:'#4caf50' })).setOrigin(0.5).setDepth(5);
        menuBtn.on('pointerdown', () => { SFX.click(); this.cameras.main.fadeOut(300,0,0,0); this.time.delayedCall(300, () => this.scene.start('Profile')); });
        menuBtn.on('pointerover', () => menuBtn.setAlpha(0.85)); menuBtn.on('pointerout', () => menuBtn.setAlpha(1));

        // Confetti
        const confetti = this.add.particles(0, 0, 'particle', {
            x:{min:0,max:W}, y:-20, speed:{min:50,max:200}, angle:{min:80,max:100},
            scale:{start:0.8,end:0}, lifespan:3000, gravityY:100,
            tint:[0xffd700,0xe63946,0x4caf50,0x457b9d,0xff6b35,0x9b5de5], frequency:80, quantity:3
        }).setDepth(2);
        this.time.delayedCall(4000, () => confetti.stop());

        // Champion celebration stars
        if (pct >= 0.9) {
            for (let i=0;i<5;i++) {
                const star = this.add.image(Phaser.Math.Between(W/2-150,W/2+150), Phaser.Math.Between(60,110), 'star').setScale(0).setAlpha(0.8).setDepth(6);
                this.tweens.add({ targets:star, scaleX:{from:0,to:0.5}, scaleY:{from:0,to:0.5}, angle:{from:0,to:360}, alpha:{from:0.9,to:0}, duration:1500, delay:i*300, ease:'Quad.easeOut' });
            }
        }

        drawVignette(this);
        this.cameras.main.fadeIn(500);
    }
}

// ============================================================
//  PHASER CONFIG
// ============================================================
const config = {
    type: Phaser.WEBGL,
    width: W * DPR,
    height: H * DPR,
    parent: 'game-container',
    backgroundColor: '#0d1b2a',
    antialias: true,
    roundPixels: true,
    render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true,
    },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, ProfileScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
