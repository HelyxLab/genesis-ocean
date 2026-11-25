import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  isSelectedTransaction,
  minimumDistanceToKeepParentVisible,
  nextTransactionClusterExpanded,
  refreshInstancedMeshBounds,
  resolveRaycastHit,
  transactionClusterTargetScale,
} from './universe.js';

const sameDelegator = {
  activeDelegatorAddress: 'delegator-A',
  address: 'delegator-A',
};

test('clicking the expanded selected delegator closes its transaction cluster', () => {
  assert.equal(nextTransactionClusterExpanded({
    ...sameDelegator,
    selectedType: 'delegator',
    currentlyExpanded: true,
  }), false);
});

test('clicking a collapsed delegator reopens its transaction cluster', () => {
  assert.equal(nextTransactionClusterExpanded({
    ...sameDelegator,
    selectedType: 'delegator',
    currentlyExpanded: false,
  }), true);
});

test('selecting a transaction does not interpret a delegator click as a close toggle', () => {
  assert.equal(nextTransactionClusterExpanded({
    ...sameDelegator,
    selectedType: 'transaction',
    currentlyExpanded: true,
  }), true);
});

test('explicit parent navigation closes the transaction cluster', () => {
  assert.equal(nextTransactionClusterExpanded({
    ...sameDelegator,
    selectedType: 'transaction',
    currentlyExpanded: true,
    preserveTransactionsClosed: true,
  }), false);
});

test('selecting a different delegator opens its own transaction cluster', () => {
  assert.equal(nextTransactionClusterExpanded({
    activeDelegatorAddress: 'delegator-A',
    address: 'delegator-B',
    selectedType: 'delegator',
    currentlyExpanded: true,
  }), true);
});

test('receiving transaction data does not open a visually closed cluster', () => {
  assert.equal(transactionClusterTargetScale(false, 3), 0);
  assert.equal(transactionClusterTargetScale(true, 3), 1);
  assert.equal(transactionClusterTargetScale(true, 0), 0);
});

test('clicking the already selected transaction is recognized as a parent return', () => {
  assert.equal(isSelectedTransaction({ type: 'transaction', data: { hash: 'TX_A' } }, 'TX_A'), true);
  assert.equal(isSelectedTransaction({ type: 'transaction', data: { hash: 'TX_A' } }, 'TX_B'), false);
  assert.equal(isSelectedTransaction({ type: 'delegator', data: {} }, 'TX_A'), false);
});

test('active validator hit takes priority over an intersected child sphere', () => {
  const transactions = {};
  const delegators = {};
  const validators = {};
  const core = {};
  const parentHit = { object: validators, instanceId: 4, distance: 2 };
  const childHit = { object: transactions, instanceId: 1, distance: 1 };

  assert.equal(resolveRaycastHit([childHit, parentHit], {
    parentObject: validators,
    parentInstanceId: 4,
    childObjects: [delegators, transactions],
    coreObject: core,
    prioritizeParent: true,
  }), parentHit);
});

test('child hit remains selected when the ray does not intersect the parent', () => {
  const transactions = {};
  const validators = {};
  const childHit = { object: transactions, instanceId: 1, distance: 1 };

  assert.equal(resolveRaycastHit([childHit], {
    parentObject: validators,
    parentInstanceId: 4,
    childObjects: [transactions],
    prioritizeParent: true,
  }), childHit);
});

test('core and unrelated validator hits keep normal nearest-hit priority', () => {
  const transactions = {};
  const validators = {};
  const core = {};
  const coreHit = { object: core, distance: 0.5 };
  const childHit = { object: transactions, distance: 1 };
  const siblingValidatorHit = { object: validators, instanceId: 2, distance: 0.75 };

  assert.equal(resolveRaycastHit([coreHit, childHit], {
    parentObject: validators,
    parentInstanceId: 4,
    childObjects: [transactions],
    coreObject: core,
    prioritizeParent: true,
  }), coreHit);
  assert.equal(resolveRaycastHit([siblingValidatorHit, childHit], {
    parentObject: validators,
    parentInstanceId: 4,
    childObjects: [transactions],
    prioritizeParent: true,
  }), siblingValidatorHit);
});

test('parent visibility zoom bound accounts for viewport aspect and camera orientation', () => {
  const parentOffset = { x: 1.5, y: 0, z: 0 };
  const common = {
    parentOffset,
    radius: 0.12,
    azimuth: 0,
    polar: Math.PI / 2,
    fovDegrees: 34,
  };
  const narrowViewport = minimumDistanceToKeepParentVisible({ ...common, aspect: 0.6 });
  const wideViewport = minimumDistanceToKeepParentVisible({ ...common, aspect: 1.8 });
  const facingCamera = minimumDistanceToKeepParentVisible({
    ...common,
    azimuth: Math.PI / 2,
    aspect: 1.8,
  });

  assert.ok(narrowViewport > wideViewport);
  assert.ok(wideViewport > facingCamera);
});

test('parent visibility zoom bound keeps the sphere inside the safe frustum', () => {
  const parentOffset = { x: 1.2, y: 0.35, z: -0.4 };
  const radius = 0.12;
  const azimuth = 0.7;
  const polar = 1.1;
  const fovDegrees = 34;
  const aspect = 1.4;
  const margin = 0.82;
  const distance = minimumDistanceToKeepParentVisible({
    parentOffset, radius, azimuth, polar, fovDegrees, aspect, margin,
  });
  const direction = {
    x: Math.sin(azimuth) * Math.sin(polar),
    y: Math.cos(polar),
    z: Math.cos(azimuth) * Math.sin(polar),
  };
  const right = { x: Math.cos(azimuth), y: 0, z: -Math.sin(azimuth) };
  const up = {
    x: -Math.cos(polar) * Math.sin(azimuth),
    y: Math.sin(polar),
    z: -Math.cos(polar) * Math.cos(azimuth),
  };
  const depth = distance - (direction.x * parentOffset.x + direction.y * parentOffset.y + direction.z * parentOffset.z);
  const horizontal = Math.abs(right.x * parentOffset.x + right.y * parentOffset.y + right.z * parentOffset.z);
  const vertical = Math.abs(up.x * parentOffset.x + up.y * parentOffset.y + up.z * parentOffset.z);
  const verticalHalfAngle = (fovDegrees * Math.PI) / 360;
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * aspect);

  assert.ok(depth > 0);
  assert.ok(horizontal + radius <= depth * Math.tan(horizontalHalfAngle * margin));
  assert.ok(vertical + radius <= depth * Math.tan(verticalHalfAngle * margin));
});

test('raycast detects a validator instance displaced beyond its previous bounding sphere', () => {
  const geometry = new THREE.SphereGeometry(0.5, 16, 12);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.computeBoundingSphere();
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(5, 0, 0));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(5, 0, 5),
    new THREE.Vector3(0, 0, -1),
  );
  assert.equal(raycaster.intersectObject(mesh, false).length, 0);

  refreshInstancedMeshBounds(mesh);

  const [hit] = raycaster.intersectObject(mesh, false);
  assert.equal(hit?.instanceId, 0);

  geometry.dispose();
  material.dispose();
});