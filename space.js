// ============================================
// Real-Time Interactive 3D Particle System
// ============================================
(function () {
    'use strict';

    // ── Configuration ──
    var CONFIG = {
        PARTICLE_COUNT: 1800,
        DEPTH: 1000,
        FOV: 75,
        BASE_SPEED: 0.15,
        MOUSE_INFLUENCE_RADIUS: 250,
        MOUSE_REPEL_FORCE: 0.8,
        CONNECTION_DISTANCE: 120,
        MAX_CONNECTIONS: 3,
        LERP: 0.04,
        ROTATION_SPEED: 0.0002,
        PULSE_SPEED: 0.003,
        DRIFT_SPEED: 0.0005,
    };

    // ── State ──
    var scene, camera, renderer, canvas;
    var particleSystem, particleMaterial, particleGeo;
    var lineMesh, lineGeo, lineMaterial;
    var mouseScreen = { x: 9999, y: 9999 };
    var mouseNorm = { x: 0, y: 0 };
    var targetCamRot = { x: 0, y: 0 };
    var clock = 0;
    var isDark = false;
    var particles = [];
    var frameCount = 0;

    // ── Theme palettes ──
    var darkColors = [
        [0.40, 0.60, 1.00],  // vivid blue
        [0.30, 0.80, 0.95],  // cyan
        [0.65, 0.50, 1.00],  // purple
        [0.90, 0.70, 1.00],  // lavender
        [0.20, 0.90, 0.80],  // teal
        [1.00, 0.80, 0.40],  // gold
        [1.00, 1.00, 1.00],  // white
    ];

    var lightColors = [
        [0.10, 0.20, 0.50],  // navy
        [0.15, 0.35, 0.60],  // steel blue
        [0.30, 0.20, 0.55],  // purple
        [0.08, 0.35, 0.55],  // deep teal
        [0.25, 0.25, 0.45],  // slate
        [0.45, 0.30, 0.15],  // bronze
        [0.20, 0.40, 0.35],  // forest
    ];

    // ── Particle class ──
    function Particle(i) {
        this.index = i;
        this.x = (Math.random() - 0.5) * CONFIG.DEPTH * 2;
        this.y = (Math.random() - 0.5) * CONFIG.DEPTH * 2;
        this.z = (Math.random() - 0.5) * CONFIG.DEPTH * 2;
        this.vx = (Math.random() - 0.5) * CONFIG.DRIFT_SPEED * 60;
        this.vy = (Math.random() - 0.5) * CONFIG.DRIFT_SPEED * 60;
        this.vz = (Math.random() - 0.5) * CONFIG.DRIFT_SPEED * 60;
        this.baseSize = Math.random() < 0.03 ? 3.0 + Math.random() * 3 :
            Math.random() < 0.15 ? 1.5 + Math.random() * 1.5 :
                0.5 + Math.random() * 1.0;
        this.phaseOffset = Math.random() * Math.PI * 2;
        this.orbitRadius = 0.1 + Math.random() * 0.3;
        this.orbitSpeed = (0.3 + Math.random() * 0.7) * (Math.random() > 0.5 ? 1 : -1);
        var palette = isDark ? darkColors : lightColors;
        var c = palette[Math.floor(Math.random() * palette.length)];
        this.r = c[0]; this.g = c[1]; this.b = c[2];
    }

    // ── Init ──
    function init() {
        canvas = document.getElementById('space-canvas');
        if (!canvas) return;

        isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Scene & Camera
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(CONFIG.FOV, window.innerWidth / window.innerHeight, 1, CONFIG.DEPTH * 3);
        camera.position.z = CONFIG.DEPTH * 0.6;

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Create systems
        createParticles();
        createConnectionLines();

        // Events
        window.addEventListener('resize', onResize);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: true });

        // Watch for theme changes
        new MutationObserver(function () {
            var nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (nowDark !== isDark) {
                isDark = nowDark;
                recolorParticles();
                updateLineMaterialColor();
            }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        animate();
    }

    // ── Create particle system ──
    function createParticles() {
        particleGeo = new THREE.BufferGeometry();
        var positions = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
        var colors = new Float32Array(CONFIG.PARTICLE_COUNT * 3);
        var sizes = new Float32Array(CONFIG.PARTICLE_COUNT);
        var alphas = new Float32Array(CONFIG.PARTICLE_COUNT);

        particles = [];
        for (var i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            var p = new Particle(i);
            particles.push(p);
            var i3 = i * 3;
            positions[i3] = p.x;
            positions[i3 + 1] = p.y;
            positions[i3 + 2] = p.z;
            colors[i3] = p.r;
            colors[i3 + 1] = p.g;
            colors[i3 + 2] = p.b;
            sizes[i] = p.baseSize;
            alphas[i] = 0.6 + Math.random() * 0.4;
        }

        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        particleGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        particleMaterial = new THREE.ShaderMaterial({
            vertexShader: [
                'attribute float size;',
                'attribute float alpha;',
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main() {',
                '  vColor = color;',
                '  vAlpha = alpha;',
                '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
                '  gl_PointSize = size * (280.0 / -mvPos.z);',
                '  gl_PointSize = max(gl_PointSize, 1.0);',
                '  gl_Position = projectionMatrix * mvPos;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vColor;',
                'varying float vAlpha;',
                'void main() {',
                '  vec2 center = gl_PointCoord - vec2(0.5);',
                '  float dist = length(center);',
                '  if (dist > 0.5) discard;',
                '  float glow = 1.0 - smoothstep(0.0, 0.5, dist);',
                '  glow = pow(glow, 2.0);',
                '  float core = 1.0 - smoothstep(0.0, 0.15, dist);',
                '  float finalAlpha = (glow * 0.6 + core * 0.4) * vAlpha;',
                '  vec3 finalColor = vColor + core * 0.3;',
                '  gl_FragColor = vec4(finalColor, finalAlpha);',
                '}'
            ].join('\n'),
            transparent: true,
            vertexColors: true,
            depthWrite: false,
            blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
        });

        particleSystem = new THREE.Points(particleGeo, particleMaterial);
        scene.add(particleSystem);
    }

    // ── Connection lines between nearby particles ──
    function createConnectionLines() {
        var maxLines = CONFIG.PARTICLE_COUNT * CONFIG.MAX_CONNECTIONS;
        lineGeo = new THREE.BufferGeometry();
        var linePositions = new Float32Array(maxLines * 6); // 2 vertices * 3 coords per line
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        lineGeo.setDrawRange(0, 0);

        lineMaterial = new THREE.LineBasicMaterial({
            color: isDark ? 0x334466 : 0x99aabb,
            transparent: true,
            opacity: isDark ? 0.15 : 0.08,
            depthWrite: false,
            blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
        });

        lineMesh = new THREE.LineSegments(lineGeo, lineMaterial);
        scene.add(lineMesh);
    }

    function updateLineMaterialColor() {
        lineMaterial.color.set(isDark ? 0x334466 : 0x99aabb);
        lineMaterial.opacity = isDark ? 0.15 : 0.08;
        lineMaterial.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
        lineMaterial.needsUpdate = true;

        particleMaterial.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
        particleMaterial.needsUpdate = true;
    }

    // ── Recolor all particles on theme change ──
    function recolorParticles() {
        var colorsArr = particleGeo.attributes.color.array;
        var palette = isDark ? darkColors : lightColors;
        for (var i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            var c = palette[Math.floor(Math.random() * palette.length)];
            particles[i].r = c[0]; particles[i].g = c[1]; particles[i].b = c[2];
            var i3 = i * 3;
            colorsArr[i3] = c[0]; colorsArr[i3 + 1] = c[1]; colorsArr[i3 + 2] = c[2];
        }
        particleGeo.attributes.color.needsUpdate = true;
    }

    // ── Mouse / Touch ──
    function onMouseMove(e) {
        mouseScreen.x = e.clientX;
        mouseScreen.y = e.clientY;
        mouseNorm.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouseNorm.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    function onTouchMove(e) {
        if (e.touches.length > 0) {
            mouseScreen.x = e.touches[0].clientX;
            mouseScreen.y = e.touches[0].clientY;
            mouseNorm.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
            mouseNorm.y = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
        }
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ── Project 3D point to screen for mouse interaction ──
    var _projVec = new THREE.Vector3();
    function projectToScreen(x, y, z) {
        _projVec.set(x, y, z);
        _projVec.project(camera);
        return {
            x: (_projVec.x * 0.5 + 0.5) * window.innerWidth,
            y: (-_projVec.y * 0.5 + 0.5) * window.innerHeight
        };
    }

    // ── Main animation loop ──
    function animate() {
        requestAnimationFrame(animate);
        clock += CONFIG.PULSE_SPEED;
        frameCount++;

        var posArr = particleGeo.attributes.position.array;
        var sizeArr = particleGeo.attributes.size.array;
        var alphaArr = particleGeo.attributes.alpha.array;

        var halfDepth = CONFIG.DEPTH;
        var connDist2 = CONFIG.CONNECTION_DISTANCE * CONFIG.CONNECTION_DISTANCE;
        var mouseInfluence2 = CONFIG.MOUSE_INFLUENCE_RADIUS * CONFIG.MOUSE_INFLUENCE_RADIUS;

        // Update particles
        for (var i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            var p = particles[i];
            var i3 = i * 3;

            // Orbital drift motion
            var angle = clock * p.orbitSpeed + p.phaseOffset;
            p.x += p.vx + Math.sin(angle) * p.orbitRadius;
            p.y += p.vy + Math.cos(angle * 0.7) * p.orbitRadius;
            p.z += p.vz + CONFIG.BASE_SPEED;

            // Wrap around boundaries
            if (p.x > halfDepth) p.x = -halfDepth;
            if (p.x < -halfDepth) p.x = halfDepth;
            if (p.y > halfDepth) p.y = -halfDepth;
            if (p.y < -halfDepth) p.y = halfDepth;
            if (p.z > halfDepth) { p.z = -halfDepth; p.x = (Math.random() - 0.5) * halfDepth * 2; p.y = (Math.random() - 0.5) * halfDepth * 2; }

            // Mouse repulsion (project particle to screen, compare distance)
            var screenPos = projectToScreen(p.x, p.y, p.z);
            var dx = screenPos.x - mouseScreen.x;
            var dy = screenPos.y - mouseScreen.y;
            var dist2 = dx * dx + dy * dy;

            if (dist2 < mouseInfluence2 && dist2 > 1) {
                var dist = Math.sqrt(dist2);
                var force = (1 - dist / CONFIG.MOUSE_INFLUENCE_RADIUS) * CONFIG.MOUSE_REPEL_FORCE;
                var nx = dx / dist;
                var ny = dy / dist;
                p.x += nx * force * 2;
                p.y -= ny * force * 2; // Inverted because screen Y is flipped
            }

            // Pulsing size
            var pulse = Math.sin(clock * 2 + p.phaseOffset) * 0.3 + 1;
            sizeArr[i] = p.baseSize * pulse;

            // Subtle alpha breathing
            alphaArr[i] = 0.5 + Math.sin(clock * 1.5 + p.phaseOffset * 2) * 0.3;

            posArr[i3] = p.x;
            posArr[i3 + 1] = p.y;
            posArr[i3 + 2] = p.z;
        }

        particleGeo.attributes.position.needsUpdate = true;
        particleGeo.attributes.size.needsUpdate = true;
        particleGeo.attributes.alpha.needsUpdate = true;

        // Update connection lines (every 2 frames for performance)
        if (frameCount % 2 === 0) {
            updateConnections(posArr, connDist2);
        }

        // Smooth camera rotation following mouse
        targetCamRot.y = mouseNorm.x * 0.15;
        targetCamRot.x = -mouseNorm.y * 0.1;
        particleSystem.rotation.y += (targetCamRot.y - particleSystem.rotation.y) * CONFIG.LERP;
        particleSystem.rotation.x += (targetCamRot.x - particleSystem.rotation.x) * CONFIG.LERP;
        lineMesh.rotation.copy(particleSystem.rotation);

        // Gentle auto-rotation
        particleSystem.rotation.y += CONFIG.ROTATION_SPEED;
        lineMesh.rotation.y = particleSystem.rotation.y;

        renderer.render(scene, camera);
    }

    // ── Connection lines logic ──
    function updateConnections(posArr, connDist2) {
        var linePos = lineGeo.attributes.position.array;
        var lineIdx = 0;
        var maxLineVertices = linePos.length;

        // Only check a subset for performance — use spatial bucketing approximation
        // Check nearby particles (simple O(n*k) approach with early exit)
        var step = Math.max(1, Math.floor(CONFIG.PARTICLE_COUNT / 600));

        for (var i = 0; i < CONFIG.PARTICLE_COUNT; i += step) {
            var connections = 0;
            var ax = posArr[i * 3];
            var ay = posArr[i * 3 + 1];
            var az = posArr[i * 3 + 2];

            for (var j = i + 1; j < CONFIG.PARTICLE_COUNT && connections < CONFIG.MAX_CONNECTIONS; j += step) {
                var bx = posArr[j * 3];
                var by = posArr[j * 3 + 1];
                var bz = posArr[j * 3 + 2];

                var dx = ax - bx;
                var dy = ay - by;
                var dz = az - bz;
                var d2 = dx * dx + dy * dy + dz * dz;

                if (d2 < connDist2) {
                    if (lineIdx + 6 > maxLineVertices) break;
                    linePos[lineIdx++] = ax;
                    linePos[lineIdx++] = ay;
                    linePos[lineIdx++] = az;
                    linePos[lineIdx++] = bx;
                    linePos[lineIdx++] = by;
                    linePos[lineIdx++] = bz;
                    connections++;
                }
            }
            if (lineIdx + 6 > maxLineVertices) break;
        }

        lineGeo.setDrawRange(0, lineIdx / 3);
        lineGeo.attributes.position.needsUpdate = true;
    }

    // ── Start ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
