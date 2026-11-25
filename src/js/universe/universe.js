import * as THREE from 'three';

const MAX_PIXEL_RATIO = 1.5;
const CORE_RADIUS_SCALE = 0.29;
const ROTATION_SPEED = 0.055;
const ORBIT_SPEED = 0.009;
const VALIDATOR_CLEARANCE = 0.12;
const CORE_CLEARANCE = 0.16;
const MAX_VALIDATOR_RADIUS = 0.14;
const VALIDATOR_BRANCH_DISPLACEMENT = 1.15;
const BONDED_RATIO_PRECISION = 1_000_000n;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PALETTE = Object.freeze({
  core: 0xffbf55,
  validator: 0x38d6cf,
  delegator: 0xa78bfa,
  transaction: 0x438cff,
});
const SPHERE_GEOMETRY = {
  validator: new THREE.SphereGeometry(1, 14, 12),
  delegator: new THREE.SphereGeometry(1, 12, 10),
  transaction: new THREE.SphereGeometry(1, 10, 8),
};

function capacityFor(count) {
  let capacity = 8;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function makeInstanceLayer(parent, geometry, material) {
  return { parent, geometry, material, mesh: null, capacity: 0, records: [], positions: [] };
}

function ensureLayerCapacity(layer, count) {
  if (layer.mesh && count <= layer.capacity) return;
  const capacity = capacityFor(count);
   const replacement = new THREE.InstancedMesh(layer.geometry, layer.material, capacity);
   replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   replacement.frustumCulled = layer.disableFrustumCulling !== true;
  if (layer.mesh) {
    layer.parent.remove(layer.mesh);
    layer.mesh.dispose();
  }
  layer.mesh = replacement;
  layer.capacity = capacity;
  layer.parent.add(replacement);
}

function balancedPositions(count, radius, phase = 0) {
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = GOLDEN_ANGLE * index + phase;
    return new THREE.Vector3(Math.cos(angle) * horizontal * radius, y * radius, Math.sin(angle) * horizontal * radius);
  });
}

function balancedValidatorPositions(radii) {
  const directions = balancedPositions(radii.length, 1, 0.21);
  let shellRadius = 1.25;
  const coreExtent = CORE_RADIUS_SCALE * 1.58 * 1.04;

  for (let index = 0; index < directions.length; index += 1) {
    shellRadius = Math.max(shellRadius, coreExtent + radii[index] + CORE_CLEARANCE);
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      const directionDistance = directions[index].distanceTo(directions[otherIndex]);
      const requiredDistance = radii[index] + radii[otherIndex] + VALIDATOR_CLEARANCE;
      if (directionDistance > 0) shellRadius = Math.max(shellRadius, requiredDistance / directionDistance);
    }
  }

  return directions.map((direction) => direction.multiplyScalar(shellRadius));
}

function positiveInteger(value) {
  return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null;
}

function compressedStake(value, maximum) {
  const amount = positiveInteger(value);
  if (amount === null || maximum <= 0n) return 0.5;
  const ratio = Number((amount * BONDED_RATIO_PRECISION) / maximum) / Number(BONDED_RATIO_PRECISION);
  return Math.sqrt(ratio);
}

function writeLayer(layer, records, positions, radiusFor, colorFor) {
  ensureLayerCapacity(layer, records.length);
  layer.records = records;
  layer.positions = positions;
  layer.focusStates?.clear();
  layer.radii = records.map((record, index) => radiusFor(record, index));
  layer.colors = records.map((record, index) => colorFor(record, index));
  const mesh = layer.mesh;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  records.forEach((record, index) => {
    matrix.compose(positions[index], quaternion, scale.setScalar(layer.radii[index]));
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, layer.colors[index]);
  });
  mesh.count = records.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function createConnectionLayer(parent, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  parent.add(lines);
  return { parent, geometry, material, lines, capacity: 0 };
}

function writeConnections(layer, positions) {
  const required = positions.length * 6;
  if (required > layer.capacity) {
    const capacity = capacityFor(required);
    const attribute = new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage);
    layer.geometry.setAttribute('position', attribute);
    layer.capacity = capacity;
  }
  const attribute = layer.geometry.getAttribute('position');
  let offset = 0;
  for (const point of positions) {
    attribute.array[offset++] = 0;
    attribute.array[offset++] = 0;
    attribute.array[offset++] = 0;
    attribute.array[offset++] = point?.x ?? 0;
    attribute.array[offset++] = point?.y ?? 0;
    attribute.array[offset++] = point?.z ?? 0;
  }
  attribute.needsUpdate = true;
  layer.geometry.setDrawRange(0, positions.length * 2);
  layer.geometry.computeBoundingSphere();
}

export function nextTransactionClusterExpanded({
  activeDelegatorAddress,
  selectedType,
  address,
  currentlyExpanded,
  preserveTransactionsClosed = false,
}) {
  if (preserveTransactionsClosed) return false;
  if (activeDelegatorAddress === address && selectedType === 'delegator' && currentlyExpanded) return false;
  return true;
}

export function transactionClusterTargetScale(expanded, transactionCount) {
  return expanded && transactionCount > 0 ? 1 : 0;
}

export function isSelectedTransaction(selection, hash) {
  return selection?.type === 'transaction' && selection.data.hash === hash;
}

export function refreshInstancedMeshBounds(mesh) {
  mesh?.computeBoundingSphere();
}

export function resolveRaycastHit(intersections, {
  parentObject = null,
  parentInstanceId = null,
  childObjects = [],
  coreObject = null,
  prioritizeParent = false,
} = {}) {
  const nearest = intersections[0] ?? null;
  if (!nearest || !prioritizeParent || nearest.object === coreObject || !childObjects.includes(nearest.object)) {
    return nearest;
  }
  return intersections.find((hit) => hit.object === parentObject && hit.instanceId === parentInstanceId) ?? nearest;
}

export function minimumDistanceToKeepParentVisible({
  parentOffset,
  radius,
  azimuth,
  polar,
  fovDegrees,
  aspect,
  margin = 0.82,
}) {
  if (!parentOffset || !Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(fovDegrees) || fovDegrees <= 0) return 0;

  const azimuthCos = Math.cos(azimuth);
  const azimuthSin = Math.sin(azimuth);
  const polarCos = Math.cos(polar);
  const polarSin = Math.sin(polar);
  const direction = {
    x: azimuthSin * polarSin,
    y: polarCos,
    z: azimuthCos * polarSin,
  };
  const right = { x: azimuthCos, y: 0, z: -azimuthSin };
  const up = {
    x: -polarCos * azimuthSin,
    y: polarSin,
    z: -polarCos * azimuthCos,
  };
  const verticalHalfAngle = THREE.MathUtils.degToRad(fovDegrees / 2);
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);
  const verticalTangent = Math.tan(verticalHalfAngle * margin);
  const horizontalTangent = Math.tan(horizontalHalfAngle * margin);
  const depthOffset = direction.x * parentOffset.x + direction.y * parentOffset.y + direction.z * parentOffset.z;
  const horizontalOffset = Math.abs(right.x * parentOffset.x + right.y * parentOffset.y + right.z * parentOffset.z);
  const verticalOffset = Math.abs(up.x * parentOffset.x + up.y * parentOffset.y + up.z * parentOffset.z);
  const requiredDepth = Math.max(
    (horizontalOffset + radius) / horizontalTangent,
    (verticalOffset + radius) / verticalTangent,
  ) + radius;

  return Math.max(0, depthOffset + requiredDepth);
}

function updateConnectionPoint(layer, index, point, visible = true) {
  const attribute = layer.geometry.getAttribute('position');
  const offset = index * 6 + 3;
  if (!attribute || offset + 2 >= attribute.array.length) return;
  attribute.array[offset] = visible ? point.x : 0;
  attribute.array[offset + 1] = visible ? point.y : 0;
  attribute.array[offset + 2] = visible ? point.z : 0;
  attribute.needsUpdate = true;
}

/** Build the Genesis universe scene and its data-driven exploration controls. */
export function initUniverse({
  onSelectObject = () => {},
  onHoverObject = () => {},
  onFocusPosition = () => {},
  onHoverPosition = () => {},
} = {}) {
  const stage = document.querySelector('.universe-stage');
  const mount = document.querySelector('[data-universe-canvas]');
  const fallback = document.querySelector('[data-universe-fallback]');
  const exploreButton = document.querySelector('[data-explore-universe]');
  const scrollZoomButton = document.querySelector('[data-scroll-zoom]');
  if (!stage || !mount || !fallback) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    fallback.hidden = false;
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 6.4);
  scene.add(new THREE.AmbientLight(0x91bcb3, 1.15));
  const keyLight = new THREE.PointLight(0x9cebd4, 32, 18, 2);
  keyLight.position.set(-3, 2.5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x2c8e91, 24, 16, 2);
  rimLight.position.set(3, -1.5, -3);
  scene.add(rimLight);

  // Keep the established core geometry, material, and lighting; only scale its group.
  const core = new THREE.Group();
  core.scale.setScalar(CORE_RADIUS_SCALE);
  scene.add(core);
  const coreGeometry = new THREE.SphereGeometry(1.42, 64, 48);
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x77502a,
    metalness: 0.42,
    roughness: 0.26,
    clearcoat: 0.72,
    clearcoatRoughness: 0.24,
    emissive: PALETTE.core,
    emissiveIntensity: 0.72,
  });
  const coreSphere = new THREE.Mesh(coreGeometry, coreMaterial);
  core.add(coreSphere);
  const coreAura = new THREE.Mesh(
    new THREE.SphereGeometry(1.58, 32, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.core, transparent: true, opacity: 0.075, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  coreAura.scale.setScalar(1.04);
  core.add(coreAura);
  const coreLight = new THREE.PointLight(PALETTE.core, 2.4, 3.8, 2);
  coreLight.position.set(0, 0, 0);
  core.add(coreLight);
  const wireframe = new THREE.Mesh(
    coreGeometry,
    new THREE.MeshBasicMaterial({ color: 0xffdb9b, wireframe: true, transparent: true, opacity: 0.12 }),
  );
  wireframe.scale.setScalar(1.003);
  core.add(wireframe);

  const validatorOrbit = new THREE.Group();
  scene.add(validatorOrbit);
  const delegationCluster = new THREE.Group();
  validatorOrbit.add(delegationCluster);
  delegationCluster.visible = false;
  delegationCluster.scale.setScalar(0.001);
  delegationCluster.userData.targetScale = 0;
  const transactionCluster = new THREE.Group();
  delegationCluster.add(transactionCluster);
  transactionCluster.visible = false;
  transactionCluster.scale.setScalar(0.001);
  transactionCluster.userData.targetScale = 0;

  const validatorLayer = makeInstanceLayer(validatorOrbit, SPHERE_GEOMETRY.validator, new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.38, roughness: 0.3, emissive: 0x123b35, emissiveIntensity: 0.65,
  }));
  validatorLayer.disableFrustumCulling = true;
  const delegatorLayer = makeInstanceLayer(delegationCluster, SPHERE_GEOMETRY.delegator, new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.24, roughness: 0.34, emissive: 0x071728, emissiveIntensity: 0.45,
  }));
  const transactionLayer = makeInstanceLayer(transactionCluster, SPHERE_GEOMETRY.transaction, new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.2, roughness: 0.32, emissive: 0x0a1b44, emissiveIntensity: 0.55,
  }));
  validatorLayer.material.emissive.setHex(PALETTE.validator);
  validatorLayer.material.emissiveIntensity = 0.38;
  delegatorLayer.material.emissive.setHex(PALETTE.delegator);
  delegatorLayer.material.emissiveIntensity = 0.36;
  transactionLayer.material.emissive.setHex(PALETTE.transaction);
  transactionLayer.material.emissiveIntensity = 0.42;
  const validatorBaseColor = new THREE.Color(PALETTE.validator);
  const delegatorColor = new THREE.Color(PALETTE.delegator);
  const transactionColor = new THREE.Color(PALETTE.transaction);
  const validatorConnections = createConnectionLayer(delegationCluster, PALETTE.delegator);
  const transactionConnections = createConnectionLayer(transactionCluster, PALETTE.transaction);
  const validatorAnchorLine = createConnectionLayer(validatorOrbit, PALETTE.validator);
  validatorAnchorLine.material.opacity = 0.26;
  validatorAnchorLine.lines.visible = false;
  const focusHaloMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const focusHalo = new THREE.Mesh(SPHERE_GEOMETRY.validator, focusHaloMaterial);
  focusHalo.visible = false;
  scene.add(focusHalo);
  const hoverHaloMaterial = focusHaloMaterial.clone();
  hoverHaloMaterial.opacity = 0.14;
  const hoverHalo = new THREE.Mesh(SPHERE_GEOMETRY.validator, hoverHaloMaterial);
  hoverHalo.visible = false;
  scene.add(hoverHalo);

  let validators = [];
  let validatorIndex = new Map();
  let delegators = [];
  let delegatorIndex = new Map();
  let transactions = [];
  let transactionIndex = new Map();
  let loadedTransactionsFor = null;
  let loadedTransactionsTotal = null;
  let transactionsExpanded = false;
  let activeValidatorAddress = null;
  let activeDelegatorAddress = null;
  let loadedDelegatorsFor = null;
  let validatorAnchorAddress = null;
  let pendingValidatorAnchorAddress = null;
  let validatorAnchorExtension = 0;
  let validatorAnchorTarget = 0;
  const validatorPositionsByAddress = new Map();
  let pulseStartedAt = 0;
  let validatorMotion = null;
  let nextValidatorMotionAt = 0;
  for (const layer of [validatorLayer, delegatorLayer, transactionLayer]) {
    layer.focusStates = new Map();
    layer.radii = [];
    layer.visibleFor = () => true;
  }
  let selection = null;
  let hoverSelection = null;
  let explorationMode = false;
  let scrollZoomEnabled = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cameraState = {
    azimuth: 0, targetAzimuth: 0,
    polar: Math.PI / 2, targetPolar: Math.PI / 2,
    distance: 7.2, targetDistance: 7.2,
    overviewDistance: 7.2,
    minDistance: 4.2, maxDistance: 14,
    focus: new THREE.Vector3(),
    targetFocus: new THREE.Vector3(),
  };
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const worldPosition = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const selectedScreenPosition = new THREE.Vector3();
  const hoverScreenPosition = new THREE.Vector3();
  const parentPositionForZoom = new THREE.Vector3();
  const parentOffsetForZoom = new THREE.Vector3();
  const instanceMatrix = new THREE.Matrix4();
  const focusMatrix = new THREE.Matrix4();
  const focusQuaternion = new THREE.Quaternion();
  const focusPosition = new THREE.Vector3();
  const focusScale = new THREE.Vector3();
  const motionAxis = new THREE.Vector3();
  const motionStart = new THREE.Vector3();
  const motionSample = new THREE.Vector3();
  const motionOffset = new THREE.Vector3();
  const branchDirection = new THREE.Vector3();
  const branchEndpoint = new THREE.Vector3();
  const stageSize = { width: 0, height: 0 };
  let frame = 0;
  let previousTime = 0;
  let inView = false;
  let activePointers = new Map();
  let gestureMode = 'idle';
  let pointerDown = null;
  let holdTimer = 0;
  let pinchStart = 0;
  let pinchZoom = 0;

  function getLayerWorldPosition(layer, index, target = worldPosition) {
    if (!layer.mesh || index < 0 || index >= layer.records.length) return null;
    layer.mesh.getMatrixAt(index, instanceMatrix);
    target.setFromMatrixPosition(instanceMatrix);
    return layer.mesh.localToWorld(target);
  }

  function getSelectedWorldPosition() {
    if (!selection) return worldPosition.set(0, 0, 0);
    if (selection.type === 'validator') {
      return getLayerWorldPosition(validatorLayer, validatorIndex.get(selection.data.operatorAddress));
    }
    if (selection.type === 'delegator') return getLayerWorldPosition(delegatorLayer, delegatorIndex.get(selection.data.delegatorAddress));
    if (selection.type === 'transaction') return getLayerWorldPosition(transactionLayer, transactionIndex.get(selection.data.hash));
    return worldPosition.set(0, 0, 0);
  }

  function selectionLayerIndex(value) {
    if (!value) return null;
    if (value.type === 'validator') return [validatorLayer, validatorIndex.get(value.data.operatorAddress), 0.42];
    if (value.type === 'delegator') return [delegatorLayer, delegatorIndex.get(value.data.delegatorAddress), 0.18];
    if (value.type === 'transaction') return [transactionLayer, transactionIndex.get(value.data.hash), 0.1];
    return null;
  }

  function applyLayerVisibility(layer) {
    if (!layer.mesh) return;
    layer.records.forEach((record, index) => {
      layer.mesh.getMatrixAt(index, focusMatrix);
      focusMatrix.decompose(focusPosition, focusQuaternion, focusScale);
      const visible = layer.visibleFor(record);
      const radius = visible ? layer.radii[index] : 0;
      focusScale.setScalar(radius);
      focusMatrix.compose(focusPosition, focusQuaternion, focusScale);
      layer.mesh.setMatrixAt(index, focusMatrix);
    });
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  function syncConnectionVisibility(connectionLayer, sourceLayer) {
    if (!sourceLayer.mesh) return;
    const positions = sourceLayer.records.map((record, index) => {
      if (!sourceLayer.visibleFor(record)) return null;
      sourceLayer.mesh.getMatrixAt(index, focusMatrix);
      focusMatrix.decompose(focusPosition, focusQuaternion, focusScale);
      return focusPosition.clone();
    });
    writeConnections(connectionLayer, positions);
  }

  function refreshFocusAndVisibility() {
    for (const layer of [validatorLayer, delegatorLayer, transactionLayer]) {
      for (const focus of layer.focusStates.values()) focus.target = 0;
    }
    const target = selectionLayerIndex(selection);
    if (target && target[1] !== undefined && target[1] !== null) {
      const [layer, index, distance] = target;
      const existing = layer.focusStates.get(index) || { current: 0, target: 0, distance };
      existing.target = distance;
      existing.distance = distance;
      layer.focusStates.set(index, existing);
    }
    delegatorLayer.visibleFor = (record) => selection?.type !== 'delegator' && selection?.type !== 'transaction'
      ? true : record.delegatorAddress === activeDelegatorAddress;
    transactionLayer.visibleFor = (record) => selection?.type !== 'transaction' || record.hash === selection.data.hash;
    for (const layer of [validatorLayer, delegatorLayer, transactionLayer]) applyLayerVisibility(layer);
    syncConnectionVisibility(validatorConnections, delegatorLayer);
    syncConnectionVisibility(transactionConnections, transactionLayer);
  }

  function updateFocusedObjects(delta) {
    for (const layer of [validatorLayer, delegatorLayer, transactionLayer]) {
      if (!layer.mesh || !layer.focusStates.size) continue;
      for (const [index, focus] of [...layer.focusStates]) {
        const alpha = reducedMotion ? 1 : 1 - Math.exp(-delta * 8);
        focus.current += (focus.target - focus.current) * alpha;
        const base = layer.positions[index];
        focusPosition.copy(base);
        if (focus.current > 0.001) focusPosition.addScaledVector(base, (focus.distance * focus.current) / base.length());
        focusScale.setScalar(layer.visibleFor(layer.records[index]) ? layer.radii[index] : 0);
        focusMatrix.compose(focusPosition, focusQuaternion, focusScale);
        layer.mesh.setMatrixAt(index, focusMatrix);
        if (layer === delegatorLayer) updateConnectionPoint(validatorConnections, index, focusPosition, layer.visibleFor(layer.records[index]));
        else if (layer === transactionLayer) updateConnectionPoint(transactionConnections, index, focusPosition, layer.visibleFor(layer.records[index]));
        if (focus.target === 0 && focus.current < 0.001) layer.focusStates.delete(index);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
    updateValidatorBranch(delta);
    refreshInstancedMeshBounds(validatorLayer.mesh);
    if (activeDelegatorAddress) {
      const index = delegatorIndex.get(activeDelegatorAddress);
      if (index !== undefined && delegatorLayer.mesh) {
        delegatorLayer.mesh.getMatrixAt(index, focusMatrix);
        focusPosition.setFromMatrixPosition(focusMatrix);
        transactionCluster.position.copy(focusPosition);
      }
    }
  }

  function updateValidatorBranch(delta) {
    let switchedAnchor = false;
    if (activeValidatorAddress) {
      if (!validatorAnchorAddress) validatorAnchorAddress = activeValidatorAddress;
      if (validatorAnchorAddress !== activeValidatorAddress) {
        pendingValidatorAnchorAddress = activeValidatorAddress;
        validatorAnchorTarget = 0;
      } else if (!pendingValidatorAnchorAddress) {
        validatorAnchorTarget = VALIDATOR_BRANCH_DISPLACEMENT;
      }
    } else {
      pendingValidatorAnchorAddress = null;
      validatorAnchorTarget = 0;
    }

    const alpha = reducedMotion ? 1 : 1 - Math.exp(-Math.max(delta, 0) * 4.5);
    validatorAnchorExtension += (validatorAnchorTarget - validatorAnchorExtension) * alpha;
    if (Math.abs(validatorAnchorTarget - validatorAnchorExtension) < 0.004) {
      validatorAnchorExtension = validatorAnchorTarget;
    }

    if (pendingValidatorAnchorAddress && validatorAnchorExtension === 0) {
      validatorAnchorAddress = pendingValidatorAnchorAddress;
      pendingValidatorAnchorAddress = null;
      validatorAnchorTarget = VALIDATOR_BRANCH_DISPLACEMENT;
      delegationCluster.userData.targetScale = loadedDelegatorsFor === validatorAnchorAddress && delegators.length ? 1 : 0;
      switchedAnchor = true;
    }

    if (switchedAnchor && !reducedMotion) {
      validatorAnchorLine.lines.visible = false;
      updateDelegationAnchor();
      return;
    }

    if (switchedAnchor && reducedMotion) {
      validatorAnchorExtension = VALIDATOR_BRANCH_DISPLACEMENT;
    }

    if (!validatorAnchorAddress) {
      validatorAnchorLine.lines.visible = false;
      return;
    }
    const index = validatorIndex.get(validatorAnchorAddress);
    if (index === undefined || !validatorLayer.mesh) {
      validatorAnchorLine.lines.visible = false;
      validatorAnchorAddress = null;
      validatorAnchorExtension = 0;
      validatorAnchorTarget = 0;
      return;
    }

    const basePosition = validatorLayer.positions[index];
    const focus = validatorLayer.focusStates.get(index);
    branchDirection.copy(basePosition).normalize();
    focusPosition.copy(basePosition).addScaledVector(branchDirection,
      validatorAnchorExtension + (focus ? focus.distance * focus.current : 0));
    focusScale.setScalar(validatorLayer.radii[index]);
    focusMatrix.compose(focusPosition, focusQuaternion, focusScale);
    validatorLayer.mesh.setMatrixAt(index, focusMatrix);
    validatorLayer.mesh.instanceMatrix.needsUpdate = true;

    branchDirection.copy(focusPosition).normalize();
    branchEndpoint.copy(focusPosition).addScaledVector(branchDirection, validatorLayer.radii[index]);
    if (validatorAnchorLine.lines.visible) updateConnectionPoint(validatorAnchorLine, 0, branchEndpoint);
    else writeConnections(validatorAnchorLine, [branchEndpoint]);
    const focusDisplacement = focus ? focus.distance * focus.current : 0;
    const branchVisible = activeValidatorAddress === validatorAnchorAddress
      || validatorAnchorExtension > 0.004 || focusDisplacement > 0.004;
    validatorAnchorLine.lines.visible = branchVisible;
    delegationCluster.position.copy(focusPosition);

    if (!activeValidatorAddress && validatorAnchorExtension === 0 && focusDisplacement < 0.004) {
      validatorAnchorLine.lines.visible = false;
      validatorAnchorAddress = null;
    }
  }

  function validatorMotionIsClear(index, start, target) {
    const radius = start.length();
    for (let sample = 1; sample <= 8; sample += 1) {
      const progress = sample / 8;
      motionSample.copy(start).lerp(target, progress).normalize().multiplyScalar(radius);
      for (let otherIndex = 0; otherIndex < validatorLayer.positions.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const minimumDistance = validatorLayer.radii[index] + validatorLayer.radii[otherIndex] + VALIDATOR_CLEARANCE;
        if (motionSample.distanceTo(validatorLayer.positions[otherIndex]) < minimumDistance) return false;
      }
    }
    return true;
  }

  function startValidatorMotion(time) {
    if (!validatorLayer.positions.length) return false;
    const index = Math.floor(Math.random() * validatorLayer.positions.length);
    const start = validatorLayer.positions[index];
    motionAxis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).cross(start).normalize();
    if (motionAxis.lengthSq() < 0.0001) motionAxis.set(1, 0, 0).cross(start).normalize();
    if (motionAxis.lengthSq() < 0.0001) motionAxis.set(0, 0, 1).cross(start).normalize();
    const angle = (0.035 + Math.random() * 0.065) * (Math.random() < 0.5 ? -1 : 1);
    const target = start.clone().applyAxisAngle(motionAxis, angle);
    const minimumCoreDistance = CORE_RADIUS_SCALE * 1.58 * 1.04 + validatorLayer.radii[index] + CORE_CLEARANCE;
    if (target.length() < minimumCoreDistance || !validatorMotionIsClear(index, start, target)) return false;
    validatorMotion = { index, start: start.clone(), target, startedAt: time, duration: 2_400 };
    return true;
  }

  function writeValidatorMotionPosition(index, position) {
    const record = validatorLayer.records[index];
    const basePosition = validatorLayer.positions[index];
    validatorLayer.mesh.getMatrixAt(index, instanceMatrix);
    instanceMatrix.decompose(focusPosition, focusQuaternion, focusScale);
    motionOffset.copy(focusPosition).sub(basePosition);
    basePosition.copy(position);
    validatorPositionsByAddress.get(record.operatorAddress)?.copy(position);
    focusPosition.copy(position).add(motionOffset);
    instanceMatrix.compose(focusPosition, focusQuaternion, focusScale);
    validatorLayer.mesh.setMatrixAt(index, instanceMatrix);
    validatorLayer.mesh.instanceMatrix.needsUpdate = true;
  }

  function updateValidatorMotion(time) {
    if (reducedMotion || selection || !validatorLayer.records.length) return;
    if (!validatorMotion) {
      if (!nextValidatorMotionAt) nextValidatorMotionAt = time + 5_000 + Math.random() * 5_000;
      if (time < nextValidatorMotionAt) return;
      if (!startValidatorMotion(time)) {
        nextValidatorMotionAt = time + 4_000 + Math.random() * 4_000;
        return;
      }
    }

    const progress = Math.min(1, (time - validatorMotion.startedAt) / validatorMotion.duration);
    const easedProgress = progress * progress * (3 - 2 * progress);
    motionStart.copy(validatorMotion.start).lerp(validatorMotion.target, easedProgress).normalize()
      .multiplyScalar(validatorMotion.start.length());
    writeValidatorMotionPosition(validatorMotion.index, motionStart);
    if (progress >= 1) {
      validatorMotion = null;
      nextValidatorMotionAt = time + 7_000 + Math.random() * 7_000;
    }
  }

  function updateOverviewDistance() {
    const coreExtent = CORE_RADIUS_SCALE * 1.58 * 1.04;
    const validatorExtent = validatorLayer.positions.reduce((maximum, position, index) =>
      Math.max(maximum, position.length() + (validatorLayer.radii[index] || 0)), coreExtent);
    const verticalHalfAngle = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * camera.aspect);
    const limitingHalfAngle = Math.min(verticalHalfAngle, horizontalHalfAngle) * 0.82;
    cameraState.overviewDistance = Math.max(4.2, validatorExtent / Math.sin(limitingHalfAngle));
    if (!selection) {
      cameraState.maxDistance = Math.max(14, cameraState.overviewDistance * 1.35);
      cameraState.targetDistance = cameraState.overviewDistance;
    }
  }

  function updateFocusHalo() {
    const value = selection || hoverSelection;
    const focused = selectionLayerIndex(value);
    if (!focused || focused[1] === undefined || focused[1] === null || !focused[0].mesh) {
      focusHalo.visible = false;
      return;
    }
    const [layer, index] = focused;
    layer.mesh.getMatrixAt(index, instanceMatrix);
    instanceMatrix.decompose(worldPosition, focusQuaternion, cameraOffset);
    focusHalo.position.copy(layer.mesh.localToWorld(worldPosition));
    focusHalo.scale.setScalar(Math.max(0.055, cameraOffset.x * 1.8));
    focusHaloMaterial.color.setHex(value.type === 'validator' ? PALETTE.validator : value.type === 'delegator' ? PALETTE.delegator : PALETTE.transaction);
    focusHaloMaterial.opacity = selection ? 0.25 : 0.14;
    focusHalo.visible = true;
  }

  function updateHoverHalo() {
    const value = hoverSelection;
    if (!value || value === selection) {
      hoverHalo.visible = false;
      return;
    }
    const focused = selectionLayerIndex(value);
    if (!focused || focused[1] === undefined || focused[1] === null || !focused[0].mesh) {
      hoverHalo.visible = false;
      return;
    }
    const [layer, index] = focused;
    layer.mesh.getMatrixAt(index, instanceMatrix);
    instanceMatrix.decompose(worldPosition, focusQuaternion, cameraOffset);
    hoverHalo.position.copy(layer.mesh.localToWorld(worldPosition));
    hoverHalo.scale.setScalar(Math.max(0.055, cameraOffset.x * 1.8));
    hoverHaloMaterial.color.setHex(value.type === 'validator' ? PALETTE.validator : value.type === 'delegator' ? PALETTE.delegator : PALETTE.transaction);
    hoverHalo.visible = true;
  }

  function pulseCore() {
    if (reducedMotion) return;
    pulseStartedAt = performance.now();
    requestRender();
  }

  function updateCorePulse(time) {
    if (!pulseStartedAt) return;
    const progress = (time - pulseStartedAt) / 720;
    if (progress >= 1) {
      pulseStartedAt = 0;
      coreMaterial.emissiveIntensity = 0.72;
      coreAura.material.opacity = 0.075;
      coreAura.scale.setScalar(1.04);
      coreLight.intensity = 2.4;
      return;
    }
    const pulse = Math.sin(Math.PI * progress) ** 2;
    coreMaterial.emissiveIntensity = 0.72 + pulse * 1.25;
    coreAura.material.opacity = 0.075 + pulse * 0.11;
    coreAura.scale.setScalar(1.04 + pulse * 0.12);
    coreLight.intensity = 2.4 + pulse * 5.5;
  }

  function getParentVisibilityMinimum(type) {
    if ((type !== 'delegator' && type !== 'transaction') || !activeValidatorAddress
      || delegationCluster.userData.targetScale <= 0) return 0;
    const index = validatorIndex.get(activeValidatorAddress);
    if (index === undefined) return 0;
    const parentPosition = getLayerWorldPosition(validatorLayer, index, parentPositionForZoom);
    const focusPosition = getSelectedWorldPosition();
    if (!parentPosition || !focusPosition) return 0;
    parentOffsetForZoom.copy(parentPosition).sub(focusPosition);
    return minimumDistanceToKeepParentVisible({
      parentOffset: parentOffsetForZoom,
      radius: validatorLayer.radii[index] || MAX_VALIDATOR_RADIUS,
      azimuth: cameraState.targetAzimuth,
      polar: cameraState.targetPolar,
      fovDegrees: camera.fov,
      aspect: camera.aspect,
    });
  }

  function getZoomLimits(type) {
    let minimum;
    let maximum;
    let target;
    if (type === 'transaction') { minimum = 0.45; maximum = 2.4; target = 1.0; }
    else if (type === 'delegator') { minimum = 0.75; maximum = 4.4; target = 1.8; }
    else if (type === 'validator') {
      minimum = 2.2;
      maximum = 6.4;
      target = camera.aspect < 0.9 ? 4.8 : 4.2;
    } else {
      minimum = 4.2;
      maximum = Math.max(14, cameraState.overviewDistance * 1.35);
      target = cameraState.overviewDistance;
    }
    const adjustedMinimum = Math.max(minimum, getParentVisibilityMinimum(type));
    const adjustment = adjustedMinimum - minimum;
    return {
      minimum: adjustedMinimum,
      maximum: maximum + adjustment,
      target: Math.max(target, adjustedMinimum),
    };
  }

  function setZoomLimits(type) {
    const limits = getZoomLimits(type);
    cameraState.minDistance = limits.minimum;
    cameraState.maxDistance = limits.maximum;
    cameraState.targetDistance = Math.max(limits.minimum, Math.min(limits.target, limits.maximum));
  }

  function emitSelection(nextSelection) {
    if (nextSelection && validatorMotion) {
      validatorMotion = null;
      nextValidatorMotionAt = performance.now() + 10_000;
    } else if (!nextSelection && selection) {
      nextValidatorMotionAt = performance.now() + 5_000 + Math.random() * 5_000;
    }
    selection = nextSelection;
    refreshFocusAndVisibility();
    setZoomLimits(selection?.type);
    if (selection) hoverSelection = null;
    onHoverObject(hoverSelection);
    onSelectObject(selection);
    renderStaticIfNeeded();
  }

  function setValidators(nextValidators) {
    if (!Array.isArray(nextValidators)) return;
    const unique = new Map();
    for (const validator of nextValidators) {
      if (validator && typeof validator.operatorAddress === 'string') unique.set(validator.operatorAddress, validator);
    }
    validators = [...unique.values()].sort((a, b) => a.operatorAddress.localeCompare(b.operatorAddress));
    validatorIndex = new Map(validators.map((validator, index) => [validator.operatorAddress, index]));
    const activeAddresses = new Set(validators.map((validator) => validator.operatorAddress));
    for (const address of validatorPositionsByAddress.keys()) {
      if (!activeAddresses.has(address)) validatorPositionsByAddress.delete(address);
    }
    let maximumStake = 0n;
    for (const validator of validators) {
      const stake = positiveInteger(validator.bondedAtoms);
      if (stake !== null && stake > maximumStake) maximumStake = stake;
    }
    const validatorRadii = validators.map((validator) => 0.065 + compressedStake(validator.bondedAtoms, maximumStake) * 0.075);
    const sameValidatorSet = validators.length === validatorPositionsByAddress.size
      && validators.every((validator) => validatorPositionsByAddress.has(validator.operatorAddress));
    if (!sameValidatorSet) {
      const balanced = balancedValidatorPositions(validatorRadii.map(() => MAX_VALIDATOR_RADIUS));
      validatorPositionsByAddress.clear();
      validators.forEach((validator, index) => validatorPositionsByAddress.set(validator.operatorAddress, balanced[index].clone()));
    }
    const positions = validators.map((validator) => validatorPositionsByAddress.get(validator.operatorAddress).clone());
    validatorMotion = null;
    nextValidatorMotionAt = performance.now() + 5_000 + Math.random() * 5_000;
    writeLayer(
      validatorLayer,
      validators,
      positions,
      (_validator, index) => validatorRadii[index],
      () => validatorBaseColor,
    );
    updateOverviewDistance();
    if (activeValidatorAddress && !validatorIndex.has(activeValidatorAddress)) {
      resetUniverse();
    } else if (activeValidatorAddress) {
      updateDelegationAnchor();
      if (selection?.type === 'validator') {
        const current = validators[validatorIndex.get(activeValidatorAddress)];
        selection = { type: 'validator', data: current };
        onSelectObject(selection);
      }
    }
    refreshFocusAndVisibility();
    renderStaticIfNeeded();
  }

  function updateDelegationAnchor() {
    const address = validatorAnchorAddress || activeValidatorAddress;
    const index = validatorIndex.get(address);
    if (index === undefined) return;
    const focus = validatorLayer.focusStates.get(index);
    branchDirection.copy(validatorLayer.positions[index]).normalize();
    focusPosition.copy(validatorLayer.positions[index]).addScaledVector(branchDirection,
      validatorAnchorExtension + (focus ? focus.distance * focus.current : 0));
    delegationCluster.position.copy(focusPosition);
  }

  function setDelegators(validatorAddress, nextDelegators) {
    if (validatorAddress !== activeValidatorAddress || !Array.isArray(nextDelegators)) return false;
    loadedDelegatorsFor = validatorAddress;
    delegators = nextDelegators.filter((entry) => (positiveInteger(entry.amountAtoms) ?? 0n) > 0n)
      .sort((a, b) => a.delegatorAddress.localeCompare(b.delegatorAddress));
    delegatorIndex = new Map(delegators.map((delegator, index) => [delegator.delegatorAddress, index]));
    updateDelegationAnchor();
    const positions = balancedPositions(delegators.length, 0.68, 0.17);
    writeLayer(delegatorLayer, delegators, positions, () => 0.035, () => delegatorColor);
    writeConnections(validatorConnections, positions);
    const branchReady = validatorAnchorAddress === validatorAddress && !pendingValidatorAnchorAddress;
    delegationCluster.userData.targetScale = delegators.length && branchReady ? 1 : 0;
    if (delegators.length) delegationCluster.visible = true;
    refreshFocusAndVisibility();

    if (selection?.type === 'delegator' && !delegatorIndex.has(selection.data.delegatorAddress)) {
      activeDelegatorAddress = null;
      loadedTransactionsFor = null;
      loadedTransactionsTotal = null;
      transactionsExpanded = false;
      transactionCluster.userData.targetScale = 0;
      emitSelection({ type: 'validator', data: validators[validatorIndex.get(activeValidatorAddress)] });
    } else if (selection?.type === 'delegator') {
      const current = delegators[delegatorIndex.get(selection.data.delegatorAddress)];
      emitSelection({ type: 'delegator', data: {
        ...current,
        validatorMoniker: validators[validatorIndex.get(activeValidatorAddress)]?.moniker,
        transactionCount: loadedTransactionsFor === current.delegatorAddress ? (loadedTransactionsTotal ?? transactions.length) : null,
      } });
    }
    renderStaticIfNeeded();
    return true;
  }

  function setTransactions(delegatorAddress, nextTransactions, total = null) {
    if (delegatorAddress !== activeDelegatorAddress || !Array.isArray(nextTransactions)) return false;
    transactions = nextTransactions;
    loadedTransactionsFor = delegatorAddress;
    loadedTransactionsTotal = typeof total === 'string' && /^\d+$/.test(total) ? total : null;
    transactionIndex = new Map(transactions.map((transaction, index) => [transaction.hash, index]));
    const positions = balancedPositions(transactions.length, 0.34, 0.31);
    writeLayer(transactionLayer, transactions, positions, () => 0.022, () => transactionColor);
    writeConnections(transactionConnections, positions);
    const activeDelegatorIndex = delegatorIndex.get(activeDelegatorAddress);
    if (activeDelegatorIndex !== undefined) {
      delegatorLayer.mesh?.getMatrixAt(activeDelegatorIndex, instanceMatrix);
      transactionCluster.position.copy(delegatorLayer.mesh ? worldPosition.setFromMatrixPosition(instanceMatrix) : delegatorLayer.positions[activeDelegatorIndex]);
    }
    transactionCluster.userData.targetScale = transactionClusterTargetScale(transactionsExpanded, transactions.length);
    if (transactions.length) transactionCluster.visible = true;
    refreshFocusAndVisibility();

    if (selection?.type === 'transaction' && !transactionIndex.has(selection.data.hash)) {
      emitSelection({ type: 'delegator', data: delegators[delegatorIndex.get(activeDelegatorAddress)] });
    } else if (selection?.type === 'transaction') {
      emitSelection({ type: 'transaction', data: transactions[transactionIndex.get(selection.data.hash)] });
    } else if (selection?.type === 'delegator') {
      emitSelection({ type: 'delegator', data: { ...selection.data, transactionCount: loadedTransactionsTotal ?? transactions.length } });
    }
    renderStaticIfNeeded();
    return true;
  }

  function selectValidator(address) {
    const index = validatorIndex.get(address);
    if (index === undefined) return;
    transactionsExpanded = false;
    if (activeValidatorAddress !== address) {
      delegationCluster.userData.targetScale = 0;
      transactionCluster.userData.targetScale = 0;
      activeDelegatorAddress = null;
      loadedDelegatorsFor = null;
      transactions = [];
      transactionIndex = new Map();
      loadedTransactionsFor = null;
      loadedTransactionsTotal = null;
    } else {
      transactionCluster.userData.targetScale = 0;
      activeDelegatorAddress = null;
    }
    activeValidatorAddress = address;
    if (validatorAnchorAddress && validatorAnchorAddress !== address) {
      pendingValidatorAnchorAddress = address;
      validatorAnchorTarget = 0;
    } else {
      validatorAnchorAddress = address;
      pendingValidatorAnchorAddress = null;
      validatorAnchorTarget = VALIDATOR_BRANCH_DISPLACEMENT;
    }
    updateDelegationAnchor();
    emitSelection({ type: 'validator', data: validators[index] });
  }

  function selectDelegator(address, { preserveTransactionsClosed = false } = {}) {
    const index = delegatorIndex.get(address);
    if (index === undefined) return;
    transactionsExpanded = nextTransactionClusterExpanded({
      activeDelegatorAddress,
      selectedType: selection?.type,
      address,
      currentlyExpanded: transactionsExpanded,
      preserveTransactionsClosed,
    });
    if (activeDelegatorAddress !== address) {
      transactionCluster.userData.targetScale = 0;
      transactions = [];
      transactionIndex = new Map();
      loadedTransactionsFor = null;
      loadedTransactionsTotal = null;
    }
    activeDelegatorAddress = address;
    const transactionsAvailable = loadedTransactionsFor === address && transactions.length > 0;
    transactionCluster.userData.targetScale = transactionClusterTargetScale(transactionsExpanded, transactionsAvailable ? transactions.length : 0);
    if (transactionCluster.userData.targetScale > 0) transactionCluster.visible = true;
    transactionCluster.position.copy(delegatorLayer.positions[index]);
    emitSelection({
      type: 'delegator',
      data: {
        ...delegators[index],
        validatorMoniker: validators[validatorIndex.get(activeValidatorAddress)]?.moniker,
        transactionCount: loadedTransactionsFor === address ? (loadedTransactionsTotal ?? transactions.length) : null,
      },
      preserveTransactionsClosed: !transactionsExpanded,
    });
  }

  function selectTransaction(hash) {
    const index = transactionIndex.get(hash);
    if (index === undefined) return;
    if (isSelectedTransaction(selection, hash)) {
      goToDelegator();
      return;
    }
    emitSelection({ type: 'transaction', data: transactions[index] });
  }

  function zoomBy(factor) {
    cameraState.targetDistance = clampZoom(cameraState.targetDistance * factor);
    requestRender();
  }

  function findIntersection(clientX, clientY) {
    const bounds = renderer.domElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointerNdc.set(((clientX - bounds.left) / bounds.width) * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointerNdc, camera);
    const meshes = [
      ...(transactionCluster.userData.targetScale > 0 && transactionLayer.mesh?.count ? [transactionLayer.mesh] : []),
      ...(delegationCluster.userData.targetScale > 0 && delegatorLayer.mesh?.count ? [delegatorLayer.mesh] : []),
      ...(validatorLayer.mesh?.count ? [validatorLayer.mesh] : []),
    ];
    meshes.push(coreSphere);
    const intersections = raycaster.intersectObjects(meshes, false);
    const activeValidatorIndex = activeValidatorAddress ? validatorIndex.get(activeValidatorAddress) : null;
    const parentHitIsAvailable = delegationCluster.userData.targetScale > 0 && activeValidatorIndex !== undefined;
    const hit = resolveRaycastHit(intersections, {
      parentObject: validatorLayer.mesh,
      parentInstanceId: activeValidatorIndex,
      childObjects: [delegatorLayer.mesh, transactionLayer.mesh],
      coreObject: coreSphere,
      prioritizeParent: parentHitIsAvailable,
    });
    if (!hit) return null;
    if (hit.object === coreSphere) return { type: 'core', data: null, point: hit.point.clone() };
    const layer = hit.object === transactionLayer.mesh ? transactionLayer
      : hit.object === delegatorLayer.mesh ? delegatorLayer : validatorLayer;
    const data = layer.records[hit.instanceId];
    const type = layer === transactionLayer ? 'transaction' : layer === delegatorLayer ? 'delegator' : 'validator';
    return data ? { type, data, point: hit.point.clone() } : null;
  }

  function setHover(nextHover) {
    const previousKey = hoverSelection ? `${hoverSelection.type}:${hoverSelection.data.hash || hoverSelection.data.delegatorAddress || hoverSelection.data.operatorAddress}` : null;
    const nextKey = nextHover ? `${nextHover.type}:${nextHover.data.hash || nextHover.data.delegatorAddress || nextHover.data.operatorAddress}` : null;
    hoverSelection = nextHover;
    if (previousKey !== nextKey) onHoverObject(hoverSelection ? { type: hoverSelection.type, data: hoverSelection.data } : null);
    renderStaticIfNeeded();
  }

  function clearHoldTimer() {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (activePointers.size === 1) {
      gestureMode = 'press';
      pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId };
      if (event.pointerType === 'touch') {
        holdTimer = window.setTimeout(() => {
          if (gestureMode !== 'press' || !pointerDown) return;
          const hit = findIntersection(pointerDown.x, pointerDown.y);
          if (hit && hit.type !== 'core') setHover(hit);
        }, 430);
      }
    } else {
      clearHoldTimer();
      gestureMode = 'pinch';
      pointerDown = null;
      setHover(null);
      const [first, second] = [...activePointers.values()];
      pinchStart = Math.hypot(first.x - second.x, first.y - second.y);
      pinchZoom = cameraState.targetDistance;
    }
  }

  function handlePointerMove(event) {
    if (activePointers.has(event.pointerId)) {
      const pointerState = activePointers.get(event.pointerId);
      const previous = { x: pointerState.x, y: pointerState.y };
      pointerState.x = event.clientX;
      pointerState.y = event.clientY;
      if (gestureMode === 'pinch' && activePointers.size >= 2) {
        const [first, second] = [...activePointers.values()];
        const distance = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
        cameraState.targetDistance = clampZoom(pinchZoom * (pinchStart / distance));
        requestRender();
        return;
      }
      if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 7) {
        clearHoldTimer();
        if (gestureMode === 'press') gestureMode = 'drag';
      }
      if (gestureMode === 'drag') {
        if (!explorationMode && window.matchMedia('(max-width: 700px)').matches) {
          setHover(null);
          return;
        }
        cameraState.targetAzimuth -= (event.clientX - previous.x) * 0.005;
        cameraState.targetPolar = Math.max(0.16, Math.min(Math.PI - 0.16, cameraState.targetPolar - (event.clientY - previous.y) * 0.005));
        cameraState.targetDistance = clampZoom(cameraState.targetDistance);
        setHover(null);
        requestRender();
      }
      return;
    }
    if (event.pointerType === 'mouse') {
      const hit = findIntersection(event.clientX, event.clientY);
      setHover(hit && hit.type !== 'core' ? hit : null);
    }
  }

  function handlePointerUp(event) {
    const wasPress = gestureMode === 'press' && pointerDown?.id === event.pointerId;
    clearHoldTimer();
    activePointers.delete(event.pointerId);
    if (activePointers.size === 0) {
      const shouldSelect = wasPress;
      gestureMode = 'idle';
      pointerDown = null;
      if (shouldSelect) {
        const hit = findIntersection(event.clientX, event.clientY);
        if (!hit) setHover(null);
        else if (hit.type === 'core') selectCore();
        else if (hit.type === 'validator') selectValidator(hit.data.operatorAddress);
        else if (hit.type === 'delegator') selectDelegator(hit.data.delegatorAddress);
        else selectTransaction(hit.data.hash);
      }
      if (event.pointerType === 'touch') setHover(null);
    }
  }

  function handlePointerCancel(event) {
    clearHoldTimer();
    activePointers.delete(event.pointerId);
    gestureMode = 'idle';
    pointerDown = null;
    setHover(null);
  }

  function clampZoom(distance) {
    const limits = getZoomLimits(selection?.type);
    cameraState.minDistance = limits.minimum;
    cameraState.maxDistance = limits.maximum;
    return Math.max(limits.minimum, Math.min(distance, limits.maximum));
  }

  function setScrollZoom(enabled) {
    scrollZoomEnabled = enabled;
    if (scrollZoomButton) {
      scrollZoomButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      scrollZoomButton.textContent = enabled ? 'Scroll Zoom ON' : 'Scroll Zoom OFF';
    }
  }

  function handleWheel(event) {
    if (!scrollZoomEnabled) return;
    event.preventDefault();
    zoomBy(Math.exp(event.deltaY * 0.001));
  }

  function updateCamera(delta) {
    const alpha = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
    cameraState.azimuth += (cameraState.targetAzimuth - cameraState.azimuth) * alpha;
    cameraState.polar += (cameraState.targetPolar - cameraState.polar) * alpha;
    cameraState.distance += (cameraState.targetDistance - cameraState.distance) * alpha;
    const target = selection ? getSelectedWorldPosition() : worldPosition.set(0, 0, 0);
    if (target) cameraState.targetFocus.copy(target);
    cameraState.focus.lerp(cameraState.targetFocus, alpha);
    const sinPolar = Math.sin(cameraState.polar);
    cameraOffset.set(
      Math.sin(cameraState.azimuth) * sinPolar,
      Math.cos(cameraState.polar),
      Math.cos(cameraState.azimuth) * sinPolar,
    ).multiplyScalar(cameraState.distance);
    camera.position.copy(cameraState.focus).add(cameraOffset);
    camera.lookAt(cameraState.focus);
  }

  function projectWorldPosition(point) {
    if (!point) return null;
    projected.copy(point).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return null;
    return { x: (projected.x * 0.5 + 0.5) * stageSize.width, y: (-projected.y * 0.5 + 0.5) * stageSize.height };
  }

  function getSelectionPosition(value, target) {
    if (!value) return null;
    if (value.type === 'validator') return getLayerWorldPosition(validatorLayer, validatorIndex.get(value.data.operatorAddress), target);
    if (value.type === 'delegator') return getLayerWorldPosition(delegatorLayer, delegatorIndex.get(value.data.delegatorAddress), target);
    if (value.type === 'transaction') return getLayerWorldPosition(transactionLayer, transactionIndex.get(value.data.hash), target);
    return null;
  }

  function animateGroup(group, delta) {
    const target = group.userData.targetScale;
    const current = group.scale.x;
    const next = reducedMotion ? target : current + (target - current) * (1 - Math.exp(-delta * 6));
    group.scale.setScalar(next);
    if (target > 0) group.visible = true;
    else if (next < 0.012) group.visible = false;
  }

  function renderStaticIfNeeded() {
    if (!reducedMotion || !inView || document.hidden) return;
    animateGroup(delegationCluster, 1);
    animateGroup(transactionCluster, 1);
    updateFocusedObjects(1);
    updateFocusHalo();
    updateHoverHalo();
    updateCamera(1);
    renderer.render(scene, camera);
    const focus = selection ? projectWorldPosition(getSelectionPosition(selection, selectedScreenPosition)) : null;
    onFocusPosition(focus);
    const hover = hoverSelection ? projectWorldPosition(getSelectionPosition(hoverSelection, hoverScreenPosition)) : null;
    if (hoverSelection && !hover) setHover(null);
    else onHoverPosition(hover);
  }

  function render(time) {
    frame = 0;
    if (!inView || document.hidden) return;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0.016;
    if (!reducedMotion) {
      core.rotation.y += delta * ROTATION_SPEED;
      core.rotation.x = Math.sin(time * 0.00012) * 0.035;
      validatorOrbit.rotation.z += delta * ORBIT_SPEED;
      animateGroup(delegationCluster, delta);
      animateGroup(transactionCluster, delta);
    } else {
      animateGroup(delegationCluster, delta);
      animateGroup(transactionCluster, delta);
    }
    updateCorePulse(time);
    updateValidatorMotion(time);
    updateFocusedObjects(delta);
    updateFocusHalo();
    updateHoverHalo();
    updateCamera(delta);
    previousTime = time;
    renderer.render(scene, camera);
    onFocusPosition(selection ? projectWorldPosition(getSelectionPosition(selection, selectedScreenPosition)) : null);
    const hover = hoverSelection ? projectWorldPosition(getSelectionPosition(hoverSelection, hoverScreenPosition)) : null;
    if (hoverSelection && !hover) setHover(null);
    else onHoverPosition(hover);
    if (!reducedMotion) frame = window.requestAnimationFrame(render);
  }

  function requestRender() {
    if (reducedMotion) renderStaticIfNeeded();
    else if (inView && !document.hidden && !frame) frame = window.requestAnimationFrame(render);
  }

  function resize() {
    const { width, height } = mount.getBoundingClientRect();
    if (!width || !height) return;
    stageSize.width = width;
    stageSize.height = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateOverviewDistance();
    if (selection?.type === 'validator') cameraState.targetDistance = camera.aspect < 0.9 ? 4.8 : 4.2;
    else cameraState.targetDistance = clampZoom(cameraState.targetDistance);
    renderer.setSize(width, height, false);
    requestRender();
  }

  function resetUniverse() {
    activeValidatorAddress = null;
    activeDelegatorAddress = null;
    transactionsExpanded = false;
    pendingValidatorAnchorAddress = null;
    validatorAnchorTarget = 0;
    delegationCluster.userData.targetScale = 0;
    transactionCluster.userData.targetScale = 0;
    cameraState.targetAzimuth = 0;
    cameraState.targetPolar = Math.PI / 2;
    cameraState.targetFocus.set(0, 0, 0);
    hoverSelection = null;
    onHoverObject(null);
    hoverHalo.visible = false;
    emitSelection(null);
    requestRender();
  }

  function selectCore() {
    resetUniverse();
    onSelectObject({ type: 'core', data: null });
  }

  function goToDelegator() {
    if (activeDelegatorAddress) selectDelegator(activeDelegatorAddress, { preserveTransactionsClosed: true });
  }

  function goToValidator() {
    if (activeValidatorAddress) selectValidator(activeValidatorAddress);
    else selectCore();
  }

  function goToParent() {
    if (selection?.type === 'transaction') goToDelegator();
    else if (selection?.type === 'delegator') goToValidator();
    else selectCore();
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  function exitExploration() {
    if (!explorationMode) return;
    explorationMode = false;
    stage.classList.remove('is-exploring');
    clearHoldTimer();
    activePointers.clear();
    gestureMode = 'idle';
    pointerDown = null;
    setHover(null);
    if (exploreButton) {
      exploreButton.textContent = 'Rotation OFF';
      exploreButton.setAttribute('aria-pressed', 'false');
    }
    requestRender();
  }

  function setExplorationMode(next) {
    if (!isMobileViewport()) {
      if (explorationMode) exitExploration();
      return;
    }
    if (next === explorationMode) return;
    if (next) {
      explorationMode = true;
      stage.classList.add('is-exploring');
      if (exploreButton) {
        exploreButton.textContent = 'Rotation ON';
        exploreButton.setAttribute('aria-pressed', 'true');
      }
      requestRender();
    } else {
      exitExploration();
    }
  }

  function installControls() {
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', () => { if (activePointers.size === 0) setHover(null); });
    stage.addEventListener('wheel', handleWheel, { passive: false });
  }

  if (exploreButton) {
    exploreButton.textContent = 'Rotation OFF';
    exploreButton.setAttribute('aria-pressed', 'false');
    exploreButton.addEventListener('click', () => {
      if (!isMobileViewport()) return;
      setExplorationMode(!explorationMode);
    });
  }

  if (scrollZoomButton) {
    scrollZoomButton.setAttribute('aria-pressed', 'false');
    scrollZoomButton.textContent = 'Scroll Zoom OFF';
    scrollZoomButton.addEventListener('click', () => {
      if (isMobileViewport()) return;
      setScrollZoom(!scrollZoomEnabled);
    });
  }

  window.addEventListener('resize', () => {
    if (!isMobileViewport() && explorationMode) exitExploration();
  });
  window.matchMedia('(max-width: 700px)').addEventListener('change', (event) => {
    if (!event.matches && explorationMode) exitExploration();
    if (scrollZoomEnabled) setScrollZoom(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && explorationMode) exitExploration();
  });
  window.addEventListener('pagehide', () => {
    if (explorationMode) exitExploration();
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) requestRender();
    else if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }
  });
  intersectionObserver.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestRender();
    else if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
    }
  });
  installControls();
  resize();
  fallback.hidden = true;

  return Object.freeze({
    setValidators,
    getActiveValidatorAddress: () => activeValidatorAddress,
    selectCore,
    selectValidator,
    selectDelegator,
    selectTransaction,
    setDelegators,
    setTransactions,
    pulseCore,
    resetUniverse,
    goToParent,
    goToDelegator,
    goToValidator,
    zoomBy,
  });
}
