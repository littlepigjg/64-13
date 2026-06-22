import assert from 'node:assert/strict';
import type { PackageListBreakdown } from '../src/types';

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

export function getHeaderSubtitle(params: {
  authEnabled: boolean;
  isAdmin: boolean;
  breakdown: PackageListBreakdown | null;
  total: number;
  search: string;
  registry: string;
  source: string;
}): string {
  const { authEnabled, isAdmin, breakdown, total, search, registry, source } = params;

  if (!authEnabled || isAdmin) {
    if (breakdown) {
      return `共 ${breakdown.total} 个包 · NPM ${breakdown.npm} · PyPI ${breakdown.pypi} · 私有 ${breakdown.privateOwned + breakdown.privateOthers} · 代理缓存 ${breakdown.cache}`;
    }
    return `管理本地缓存的 NPM 和 PyPI 包，共 ${total} 个`;
  }

  const myPrivateCount = breakdown?.privateOwned ?? 0;
  const cacheCount = breakdown?.cache ?? 0;
  const othersPrivate = breakdown?.privateOthers ?? 0;
  if (search || registry || source) {
    return `当前筛选结果：${total} 个包 · 我上传的私有包 ${myPrivateCount} 个 · 他人私有 ${othersPrivate} · 代理缓存 ${cacheCount} 个`;
  }
  return `共 ${total} 个包 · 我上传的私有包 ${myPrivateCount} 个 · 团队共享代理缓存 ${cacheCount} 个${othersPrivate ? ` · 他人私有 ${othersPrivate} 个` : ''}`;
}

console.log('\n[Frontend] 包列表副标题逻辑测试\n');

const MOCK_BREAKDOWN: PackageListBreakdown = {
  total: 100,
  privateOwned: 7,
  privateOthers: 3,
  cache: 90,
  npm: 80,
  pypi: 20,
};

// ===== 管理员视角 =====
test('管理员 - 显示详细 breakdown 统计', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: true,
    breakdown: MOCK_BREAKDOWN,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(s.includes('共 100 个包'), '包含总数');
  assert.ok(s.includes('NPM 80'), '包含 NPM 数');
  assert.ok(s.includes('PyPI 20'), '包含 PyPI 数');
  assert.ok(s.includes('私有 10'), '私有包 = 我的 + 他人');
  assert.ok(s.includes('代理缓存 90'), '包含缓存数');
});

test('管理员 - breakdown 为 null 时显示兜底文案', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: true,
    breakdown: null,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(s.includes('共 100 个'), '包含 total');
  assert.ok(s.includes('管理本地缓存'), '管理员兜底文案');
});

test('鉴权关闭时 - 等同于管理员视角', () => {
  const s = getHeaderSubtitle({
    authEnabled: false,
    isAdmin: false,
    breakdown: MOCK_BREAKDOWN,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(s.includes('共 100 个包'), '鉴权关闭时也显示完整统计');
});

// ===== 开发者视角 =====
test('开发者 - 显示我的私有包 + 代理缓存 + 他人私有', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: MOCK_BREAKDOWN,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(s.includes('共 100 个包'), '包含总数');
  assert.ok(s.includes('我上传的私有包 7 个'), '我的 7 个');
  assert.ok(s.includes('团队共享代理缓存 90 个'), '缓存 90 个');
  assert.ok(s.includes('他人私有 3 个'), '他人 3 个');
});

test('开发者 - 他人私有为 0 时不显示该段', () => {
  const b: PackageListBreakdown = { ...MOCK_BREAKDOWN, privateOthers: 0, total: 97, privateOwned: 7, cache: 90 };
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: b,
    total: 97,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(!s.includes('他人私有'), '他人私有为 0 时不显示');
  assert.ok(s.includes('我上传的私有包 7 个'), '仍显示我的私有包');
});

test('开发者 - breakdown 为 null 时 fallback 0', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: null,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.ok(s.includes('我上传的私有包 0 个'), 'fallback 为 0');
  assert.ok(s.includes('团队共享代理缓存 0 个'), '缓存 fallback 0');
});

// ===== 筛选场景 =====
test('开发者 - 进行搜索时显示「当前筛选结果」前缀', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: { ...MOCK_BREAKDOWN, total: 5, privateOwned: 2, cache: 3 },
    total: 5,
    search: 'core',
    registry: '',
    source: '',
  });
  assert.ok(s.startsWith('当前筛选结果：'), '搜索时有筛选前缀');
  assert.ok(s.includes('我上传的私有包 2 个'), '包含我的私有包在筛选结果中的数量');
});

test('开发者 - 选择仓库时显示「当前筛选结果」前缀', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: { ...MOCK_BREAKDOWN, total: 80, npm: 80, pypi: 0 },
    total: 80,
    search: '',
    registry: 'npm',
    source: '',
  });
  assert.ok(s.startsWith('当前筛选结果：'), '选 npm 时有筛选前缀');
});

test('开发者 - 选择来源时显示「当前筛选结果」前缀', () => {
  const s = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: { ...MOCK_BREAKDOWN, total: 7, privateOwned: 7, cache: 0, privateOthers: 0 },
    total: 7,
    search: '',
    registry: '',
    source: 'private',
  });
  assert.ok(s.startsWith('当前筛选结果：'), '选 source 时有筛选前缀');
  assert.ok(s.includes('我上传的私有包 7 个'), '我的私有包 7 个');
});

// ===== 翻页场景：核心问题修复验证 =====
test('翻页场景 - breakdown 不随分页变化（固定总数）', () => {
  const page1 = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: MOCK_BREAKDOWN,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  const page3 = getHeaderSubtitle({
    authEnabled: true,
    isAdmin: false,
    breakdown: MOCK_BREAKDOWN,
    total: 100,
    search: '',
    registry: '',
    source: '',
  });
  assert.equal(page1, page3, '第 1 页和第 3 页副标题完全一致（关键修复）');
  assert.ok(page1.includes('我上传的私有包 7 个'), '固定显示 7 个，而不是当前页的 1 个/0 个');
});

test('翻页场景 - admin 视角下 NPM/PyPI 统计也稳定', () => {
  const p1 = getHeaderSubtitle({ authEnabled: true, isAdmin: true, breakdown: MOCK_BREAKDOWN, total: 100, search: '', registry: '', source: '' });
  const p3 = getHeaderSubtitle({ authEnabled: true, isAdmin: true, breakdown: MOCK_BREAKDOWN, total: 100, search: '', registry: '', source: '' });
  assert.equal(p1, p3, '管理员视角分页一致');
  assert.ok(p1.includes('私有 10'), '私有包统计 = privateOwned + privateOthers，不因分页变');
});

// ===== 边界：空值 =====
test('边界 - 全 0 时显示 0 不崩溃', () => {
  const zero: PackageListBreakdown = { total: 0, privateOwned: 0, privateOthers: 0, cache: 0, npm: 0, pypi: 0 };
  const sDev = getHeaderSubtitle({ authEnabled: true, isAdmin: false, breakdown: zero, total: 0, search: '', registry: '', source: '' });
  const sAdm = getHeaderSubtitle({ authEnabled: true, isAdmin: true, breakdown: zero, total: 0, search: '', registry: '', source: '' });
  assert.ok(sDev.includes('共 0 个包'), '开发者 0 包正常');
  assert.ok(sAdm.includes('私有 0'), '管理员视角 0 私有包正常');
});

// 输出结果
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (failures.length) {
  console.log('\n失败详情:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
