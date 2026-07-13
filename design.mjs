const ROLE_NAMES = ['bg', 'ink', 'accent', 'muted'];

export function defineMotionRoles(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('AnimeFX 需要一个包含 bg、ink、accent、muted 的角色对象。');
  }

  const missing = ROLE_NAMES.filter((name) => typeof input[name] !== 'string' || !input[name].trim());
  if (missing.length) throw new TypeError(`design.md 缺少动效角色: ${missing.join(', ')}`);

  return Object.freeze(Object.fromEntries(ROLE_NAMES.map((name) => [name, input[name].trim()])));
}

export const motionRoleNames = Object.freeze([...ROLE_NAMES]);
