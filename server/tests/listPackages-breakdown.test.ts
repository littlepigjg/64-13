import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MetadataIndex } from '../src/modules/metadata';
import type { RegistryType, PackageSource, PackageListBreakdown } from '../src/types';

let tmpDir: string;
let idx: MetadataIndex;
let cleanupFns: Array<() => void> = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listpackages-test-'));
  cleanupFns.push(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
  return dir;
}

function seedPackage(
  name: string,
  registry: RegistryType,
  source: PackageSource,
  ownerId?: number,
  ownerName?: string
) {
  const pkgId = idx.getOrCreatePackage(name, registry, source, undefined, ownerId, ownerName);
  idx.addVersion(pkgId, '1.0.0', 10_000, `/tmp/${name}-1.0.0.tgz`, 'abc123');
  idx.addVersion(pkgId, '1.1.0', 12_000, `/tmp/${name}-1.1.0.tgz`, 'def456');
  return pkgId;
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  ✗ ${name}`);
    if (e instanceof Error) console.log(`      ${e.message}`);
  }
}

function assertBreakdown(actual: PackageListBreakdown, expected: Partial<PackageListBreakdown>, msg: string) {
  for (const k of Object.keys(expected) as (keyof PackageListBreakdown)[]) {
    assert.equal(actual[k], expected[k], `${msg} -> breakdown.${k}: expected ${expected[k]}, got ${actual[k]}`);
  }
}

function setup() {
  tmpDir = makeTmpDir();
  process.env['NO_AUTH'] = '1';
  idx = new MetadataIndex(tmpDir);
}

function teardown() {
  if (idx) {
    try {
      (idx as any).close?.();
    } catch {
      // ignore
    }
  }
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
}

console.log('\n[Backend] listPackages breakdown 统计测试\n');

try {
  // ===== 测试 1：空库 =====
  setup();
  test('空库 - breakdown 全 0', () => {
    const res = idx.listPackages();
    assertBreakdown(res.breakdown, { total: 0, privateOwned: 0, privateOthers: 0, cache: 0, npm: 0, pypi: 0 }, 'empty');
  });
  teardown();

  // ===== 测试 2：混合包 =====
  setup();
  seedPackage('express', 'npm', 'cache');
  seedPackage('lodash', 'npm', 'cache');
  seedPackage('requests', 'pypi', 'cache');
  seedPackage('@myco/core', 'npm', 'private', 1, 'alice');
  seedPackage('@myco/utils', 'npm', 'private', 1, 'alice');
  seedPackage('@yourco/admin', 'npm', 'private', 2, 'bob');
  seedPackage('django', 'pypi', 'cache');

  test('未传 ownerId（管理员视角）- 总数正确', () => {
    const res = idx.listPackages();
    assertBreakdown(res.breakdown, {
      total: 7,
      privateOwned: 3,
      privateOthers: 0,
      cache: 4,
      npm: 5,
      pypi: 2,
    }, 'admin view');
  });

  test('未传 ownerId 且 ownerId 缺失的包算 privateOthers', () => {
    idx.getOrCreatePackage('@myco/nobody', 'npm', 'private');
    const res = idx.listPackages();
    assertBreakdown(res.breakdown, {
      total: 8,
      privateOwned: 3,
      privateOthers: 1,
      cache: 4,
      npm: 6,
      pypi: 2,
    }, 'owner-less private');
  });
  teardown();

  // ===== 测试 3：alice（开发者，ownerId=1）视角 =====
  setup();
  seedPackage('express', 'npm', 'cache');
  seedPackage('lodash', 'npm', 'cache');
  seedPackage('requests', 'pypi', 'cache');
  seedPackage('@myco/core', 'npm', 'private', 1, 'alice');
  seedPackage('@myco/utils', 'npm', 'private', 1, 'alice');
  seedPackage('@yourco/admin', 'npm', 'private', 2, 'bob');
  seedPackage('django', 'pypi', 'cache');

  test('alice 视角 - 自己的 2 个 private 算 privateOwned，他人私有包被过滤', () => {
    const res = idx.listPackages({ ownerId: 1 });
    assertBreakdown(res.breakdown, {
      total: 6,
      privateOwned: 2,
      privateOthers: 0,
      cache: 4,
      npm: 4,
      pypi: 2,
    }, 'alice');
  });

  test('alice 视角 - 搜索 myco 只返回她自己的私有包', () => {
    const res = idx.listPackages({ ownerId: 1, search: 'myco' });
    assertBreakdown(res.breakdown, {
      total: 2,
      privateOwned: 2,
      privateOthers: 0,
      cache: 0,
      npm: 2,
      pypi: 0,
    }, 'alice + search=myco');
  });

  test('alice 视角 - source=private 过滤只看自己的私有包', () => {
    const res = idx.listPackages({ ownerId: 1, source: 'private' });
    assertBreakdown(res.breakdown, {
      total: 2,
      privateOwned: 2,
      privateOthers: 0,
      cache: 0,
      npm: 2,
      pypi: 0,
    }, 'alice + source=private');
  });
  teardown();

  // ===== 测试 4：bob（ownerId=2）视角 =====
  setup();
  seedPackage('express', 'npm', 'cache');
  seedPackage('@myco/core', 'npm', 'private', 1, 'alice');
  seedPackage('@yourco/admin', 'npm', 'private', 2, 'bob');
  seedPackage('requests', 'pypi', 'cache');

  test('bob 视角 - 只看到自己的 private 和所有 cache，alice 的私有包被过滤', () => {
    const res = idx.listPackages({ ownerId: 2 });
    assertBreakdown(res.breakdown, {
      total: 3,
      privateOwned: 1,
      privateOthers: 0,
      cache: 2,
      npm: 2,
      pypi: 1,
    }, 'bob');
  });

  test('bob 视角 - 看不到 alice 的私有包（被后端过滤掉了）', () => {
    const res = idx.listPackages({ ownerId: 2, source: 'private' });
    assertBreakdown(res.breakdown, {
      total: 1,
      privateOwned: 1,
      privateOthers: 0,
      cache: 0,
      npm: 1,
      pypi: 0,
    }, 'bob + source=private');
    const names = res.packages.map(p => p.name);
    assert.ok(!names.includes('@myco/core'), 'bob 看不到 alice 的 @myco/core');
    assert.ok(names.includes('@yourco/admin'), 'bob 可以看到自己的 @yourco/admin');
  });
  teardown();

  // ===== 测试 5：分页不影响 breakdown =====
  setup();
  for (let i = 0; i < 50; i++) {
    seedPackage(`cached-pkg-${i}`, i % 2 === 0 ? 'npm' : 'pypi', 'cache');
  }
  for (let i = 0; i < 15; i++) {
    seedPackage(`@my/priv-${i}`, 'npm', 'private', 3, 'charlie');
  }

  test('第 1 页（limit 10）breakdown 和第 3 页一致', () => {
    const r1 = idx.listPackages({ ownerId: 3, limit: 10, offset: 0 });
    const r3 = idx.listPackages({ ownerId: 3, limit: 10, offset: 20 });
    assertBreakdown(r3.breakdown, {
      total: r1.breakdown.total,
      privateOwned: r1.breakdown.privateOwned,
      privateOthers: 0,
      cache: r1.breakdown.cache,
      npm: r1.breakdown.npm,
      pypi: r1.breakdown.pypi,
    }, '分页一致性');
    assert.equal(r1.breakdown.total, 65);
    assert.equal(r1.breakdown.privateOwned, 15);
    assert.equal(r1.packages.length, 10);
    assert.equal(r3.packages.length, 10);
  });
  teardown();

  // ===== 测试 6：registry 过滤 =====
  setup();
  seedPackage('express', 'npm', 'cache');
  seedPackage('requests', 'pypi', 'cache');
  seedPackage('@my/a', 'npm', 'private', 1, 'a');
  seedPackage('@my/b', 'pypi', 'private', 1, 'a');

  test('registry=npm 只统计 npm 包', () => {
    const res = idx.listPackages({ registry: 'npm' });
    assertBreakdown(res.breakdown, { total: 2, cache: 1, npm: 2, pypi: 0, privateOwned: 1, privateOthers: 0 }, 'registry=npm');
  });

  test('registry=pypi 只统计 pypi 包', () => {
    const res = idx.listPackages({ registry: 'pypi' });
    assertBreakdown(res.breakdown, { total: 2, cache: 1, npm: 0, pypi: 2, privateOwned: 1, privateOthers: 0 }, 'registry=pypi');
  });
  teardown();
} finally {
  teardown();
}

// 输出结果
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (failures.length) {
  console.log('\n失败详情:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
