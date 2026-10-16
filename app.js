import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const ASSET_BASE_URL = "https://api.getlayers.ai/storage/v1/object/public/public/assets/laocoon-59f84455c6";
const canvas = document.querySelector('#webgl');
let scene, camera, renderer, gltfModel, modelPivot, mixer;
const clock = new THREE.Clock();
let currentScroll = 0;
let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0;
let cursorX = innerWidth / 2, cursorY = innerHeight / 2, outerCursorX = innerWidth / 2, outerCursorY = innerHeight / 2;
let bgMaterial;
const shaderUniforms = { uTime:{value:0}, uResolution:{value:new THREE.Vector2(innerWidth, innerHeight)}, uMouse:{value:new THREE.Vector2(0,0)}, uScroll:{value:0} };
let sparkParticles;
const sparkCount = 450, sparkData = [];
const sizes = { width: innerWidth, height: innerHeight };

function createSparkTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(8,8,0,8,8,8);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.25,'rgba(255,255,255,0.85)');
  g.addColorStop(.6,'rgba(255,255,255,0.3)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,16,16);
  return new THREE.CanvasTexture(c);
}
function createSparks() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(sparkCount*3), colors = new Float32Array(sparkCount*3);
  for (let i = 0; i < sparkCount; i++) {
    positions[i*3] = (Math.random()-.5)*6.5;
    positions[i*3+1] = (Math.random()-.5)*5.0 - .5;
    positions[i*3+2] = (Math.random()-.5)*6.5;
    if (Math.random() < .6) { colors[i*3] = 1; colors[i*3+1] = .4+Math.random()*.15; colors[i*3+2] = .05+Math.random()*.1; }
    else { colors[i*3] = .55+Math.random()*.15; colors[i*3+1] = .82+Math.random()*.12; colors[i*3+2] = 1; }
    sparkData.push({ speedX:(Math.random()-.5)*.4, speedY:.15+Math.random()*.3, speedZ:(Math.random()-.5)*.4, swaySpeed:.5+Math.random()*1.5, swayRadius:.05+Math.random()*.15, phase:Math.random()*Math.PI*2 });
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const material = new THREE.PointsMaterial({ size:.025, vertexColors:true, transparent:true, opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false, map:createSparkTexture() });
  sparkParticles = new THREE.Points(geometry, material);
  scene.add(sparkParticles);
}
function loadModel() {
  new GLTFLoader().load(ASSET_BASE_URL + '/bronze_horse.glb', (gltf) => {
    gltfModel = gltf.scene;
    modelPivot = new THREE.Group(); scene.add(modelPivot); modelPivot.add(gltfModel);
    gltfModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; child.receiveShadow = true;
        if (child.material) {
          child.material.roughness = .42; child.material.metalness = .92; child.material.flatShading = false;
          if (child.material.map) child.material.map.anisotropy = 16;
        }
      }
    });
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(gltfModel);
      gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    }
    const s0 = new THREE.Box3().setFromObject(gltfModel).getSize(new THREE.Vector3());
    const maxDim = Math.max(s0.x, s0.y, s0.z);
    gltfModel.scale.setScalar(3.5 / (maxDim > .0001 ? maxDim : 1));
    gltfModel.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(gltfModel).getCenter(new THREE.Vector3());
    gltfModel.position.sub(center);
    modelPivot.position.y = -.4;
  }, undefined, (e) => console.error('Error loading bronze horse model:', e));
}
function createBackgroundShader() {
  const vertexShader = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const fragmentShader = `
    varying vec2 vUv;
    uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse; uniform float uScroll;
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    float noise(in vec3 x){
      vec3 p = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      float n = p.x + p.y*57.0 + 113.0*p.z;
      return mix(mix(mix(hash(n+0.0),hash(n+1.0),f.x), mix(hash(n+57.0),hash(n+58.0),f.x),f.y),
                 mix(mix(hash(n+113.0),hash(n+114.0),f.x), mix(hash(n+170.0),hash(n+171.0),f.x),f.y),f.z);
    }
    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
      float aspect = uResolution.x / uResolution.y;
      float time = uTime * 0.08;
      float scroll = uScroll;
      float angle1 = 0.6; float angle2 = -0.7; float angle3 = 1.2;
      float freq1 = 2.4; float freq2 = 3.2; float freq3 = 4.0;
      vec2 warpedUv = uv;
      float scrollDeform = scroll * 5.0;
      warpedUv.x += sin(uv.y * 2.5 + time * 0.2 + scrollDeform) * 0.35;
      warpedUv.y += cos(uv.x * 2.5 - time * 0.15 - scrollDeform * 0.8) * 0.35;
      warpedUv.x += sin(uv.y * 1.2 - time * 0.1 - scrollDeform * 1.5) * 0.25;
      warpedUv.y += cos(uv.x * 1.2 + time * 0.18 + scrollDeform * 1.2) * 0.25;
      vec2 scrollDrift = vec2(scroll * 0.04, -scroll * 0.02);
      vec2 mouseShift = vec2(uMouse.x * aspect * 0.05, uMouse.y * 0.05);
      warpedUv += scrollDrift + mouseShift;
      vec2 dir1 = vec2(cos(angle1), sin(angle1));
      vec2 dir2 = vec2(cos(angle2), sin(angle2));
      vec2 dir3 = vec2(cos(angle3), sin(angle3));
      float w1 = sin(dot(warpedUv, dir1) * freq1 + time * 1.0);
      float w2 = cos(dot(warpedUv, dir2) * freq2 - time * 1.4 + w1 * 0.4);
      float w3 = sin(dot(warpedUv, dir3) * freq3 + time * 1.8 + w2 * 0.5);
      float waveField = w1 * 0.50 + w2 * 0.35 + w3 * 0.15;
      float wideSheen = pow(max(0.0, 1.0 - abs(waveField - 0.1)), 2.5);
      float crispSpecular = pow(max(0.0, 1.0 - abs(waveField - 0.15)), 8.0);
      float crest = wideSheen * 0.5 + crispSpecular * 0.9;
      vec3 c0_shadow = vec3(0.0010, 0.0006, 0.0004);
      vec3 c0_wave1  = vec3(0.085, 0.040, 0.015);
      vec3 c0_wave2  = vec3(0.050, 0.022, 0.008);
      vec3 c0_crest  = vec3(0.45, 0.30, 0.18);
      vec3 c1_shadow = vec3(0.0004, 0.0006, 0.0012);
      vec3 c1_wave1  = vec3(0.015, 0.035, 0.065);
      vec3 c1_wave2  = vec3(0.008, 0.020, 0.045);
      vec3 c1_crest  = vec3(0.18, 0.35, 0.55);
      float t = smoothstep(0.0, 1.0, scroll);
      vec3 colShadow = mix(c0_shadow, c1_shadow, t);
      vec3 colWave1  = mix(c0_wave1, c1_wave1, t);
      vec3 colWave2  = mix(c0_wave2, c1_wave2, t);
      vec3 colCrest  = mix(c0_crest, c1_crest, t);
      vec3 color = colShadow;
      color = mix(color, colWave2, smoothstep(-0.6, 0.2, waveField));
      color = mix(color, colWave1, smoothstep(0.0, 0.8, waveField));
      color += colCrest * crest * 1.4;
      float vignette = 1.0 - dot(uv, uv) * 0.12;
      color *= vignette;
      gl_FragColor = vec4(color, 1.0);
    }`;
  bgMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: shaderUniforms, depthWrite:false, depthTest:false });
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(30,30), bgMaterial);
  bgMesh.position.set(0,0,-8); bgMesh.renderOrder = -10;
  camera.add(bgMesh);
}
function onWindowResize() {
  sizes.width = innerWidth; sizes.height = innerHeight;
  camera.aspect = sizes.width / sizes.height; camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  shaderUniforms.uResolution.value.set(sizes.width, sizes.height);
}
addEventListener('mousemove', (e) => {
  cursorX = e.clientX; cursorY = e.clientY;
  const ci = document.querySelector('.cursor-inner');
  if (ci) { ci.style.left = cursorX + 'px'; ci.style.top = cursorY + 'px'; }
  targetMouseX = (e.clientX / innerWidth) * 2 - 1;
  targetMouseY = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener('resize', onWindowResize);

function splitTitlesIntoChars() {
  document.querySelectorAll('.slide-title').forEach(title => {
    let html = '', n = 0;
    title.innerHTML.split(/(<br\s*\/?>)/i).forEach(part => {
      if (part.toLowerCase().startsWith('<br')) html += part;
      else for (let i = 0; i < part.length; i++) {
        if (part[i] === ' ') html += ' ';
        else { html += `<span class="char" style="transition-delay: ${n * 0.035}s">${part[i]}</span>`; n++; }
      }
    });
    title.innerHTML = html;
  });
}
function updateGridDots(scroll) {
  document.querySelectorAll('.grid-dot').forEach((dot, i) => {
    const startY = (i * 17) % 80 + 10;
    let speed = 90 + (i * 55) % 180;
    if (i % 2 === 0) speed = -speed;
    let y = startY + scroll * speed;
    y = ((y % 100) + 100) % 100;
    dot.style.top = `${y}%`;
  });
}
function updateSlides(scroll) {
  const s = [1,2,3,4].map(i => document.getElementById('slide-' + i));
  for (let i = 1; i <= 4; i++) {
    const fill = document.getElementById(`dash-fill-${i}`);
    if (fill) {
      const start = (i - 1) * .25, end = i * .25;
      fill.style.height = `${Math.max(0, Math.min(1, (scroll - start) / (end - start))) * 100}%`;
    }
  }
  const on = (v, a, b) => v >= a && v <= b;
  s[0].classList.toggle('active', on(scroll, -.10, .12));
  const a2 = on(scroll, .28, .40);
  s[1].classList.toggle('active', a2);
  document.getElementById('slide-2-img').classList.toggle('active', a2);
  s[2].classList.toggle('active', on(scroll, .56, .68));
  s[3].classList.toggle('active', on(scroll, .84, 1.05));
}
function setupNavigation() {
  const targets = [0.0, 0.34, 0.62, 0.94];
  document.querySelectorAll('.nav-link').forEach((link, index) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo({ top: maxScroll * targets[index], behavior: 'smooth' });
    });
  });
}
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  const scrollTop = window.scrollY !== undefined ? window.scrollY : (window.pageYOffset !== undefined ? window.pageYOffset : document.documentElement.scrollTop);
  const targetScroll = maxScroll > 0 ? scrollTop / maxScroll : 0;
  currentScroll += (targetScroll - currentScroll) * 0.025;
  mouseX += (targetMouseX - mouseX) * 0.05;
  mouseY += (targetMouseY - mouseY) * 0.05;
  outerCursorX += (cursorX - outerCursorX) * 0.2;
  outerCursorY += (cursorY - outerCursorY) * 0.2;
  const co = document.querySelector('.cursor-outer');
  if (co) { co.style.left = `${outerCursorX}px`; co.style.top = `${outerCursorY}px`; }
  if (modelPivot) { modelPivot.rotation.y = mouseX * 0.25; modelPivot.rotation.x = mouseY * 0.15; }
  if (sparkParticles) {
    const p = sparkParticles.geometry.attributes.position.array;
    const time = clock.getElapsedTime();
    const sv = Math.abs(targetScroll - currentScroll);
    const sm = 1.0 + sv * 9.0, turb = sv * 0.8;
    for (let i = 0; i < sparkCount; i++) {
      const k = i * 3, d = sparkData[i];
      p[k] += d.speedX * dt * sm; p[k+1] += d.speedY * dt * sm; p[k+2] += d.speedZ * dt * sm;
      const sway = d.swayRadius * (1.0 + turb * 4.0);
      p[k] += Math.sin(time * d.swaySpeed + d.phase) * sway * dt;
      p[k+2] += Math.cos(time * d.swaySpeed + d.phase) * sway * dt;
      if (p[k+1] > 3.0 || Math.abs(p[k]) > 3.5 || Math.abs(p[k+2]) > 3.5) {
        p[k+1] = -2.5; p[k] = (Math.random() - .5) * 3.0; p[k+2] = (Math.random() - .5) * 3.0;
      }
    }
    sparkParticles.geometry.attributes.position.needsUpdate = true;
  }
  const phi = currentScroll * Math.PI * 2.0;
  const y = 0.35 + Math.sin(currentScroll * Math.PI) * 0.8;
  const radius = 4.2 - Math.sin(currentScroll * Math.PI) * 0.6;
  const x = radius * Math.sin(phi), z = radius * Math.cos(phi);
  const tp = Math.min(1.0, currentScroll / 0.28);
  const ease = (Math.cos(tp * Math.PI) + 1.0) * 0.5;
  camera.position.lerp(new THREE.Vector3(x, y, z), 0.025);
  camera.lookAt(new THREE.Vector3(-0.9 * ease, -0.15, 0));
  shaderUniforms.uTime.value = clock.getElapsedTime();
  shaderUniforms.uMouse.value.set(mouseX, -mouseY);
  shaderUniforms.uScroll.value = currentScroll;
  updateSlides(currentScroll);
  updateGridDots(currentScroll);
  renderer.render(scene, camera);
}
function init() {
  splitTitlesIntoChars();
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.FogExp2('#000000', 0.01);
  camera = new THREE.PerspectiveCamera(50, sizes.width / sizes.height, 0.1, 100);
  camera.position.set(0, 0.2, 3.0);
  scene.add(camera);
  createBackgroundShader();
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:"high-performance" });
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.2;
  scene.add(new THREE.AmbientLight('#ffffff', 0.1));
  const key = new THREE.SpotLight('#ffffff', 18.0);
  key.position.set(4, 6, 3); key.angle = Math.PI / 4; key.penumbra = 0.9; key.castShadow = true;
  key.shadow.mapSize.width = 2048; key.shadow.mapSize.height = 2048;
  key.shadow.camera.near = 1.0; key.shadow.camera.far = 15; key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#e3f2ff', 10.0); rim.position.set(-5, 3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight('#fff3e6', 0.8); fill.position.set(-2, -4, 2); scene.add(fill);
  createSparks();
  loadModel();
  onWindowResize();
  animate();
  setupNavigation();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
