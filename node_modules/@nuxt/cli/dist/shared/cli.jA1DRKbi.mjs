import { parseINI } from 'confbox';
import { $fetch } from 'ofetch';
import { readPackageJSON } from 'pkg-types';
import { coerce, satisfies } from 'semver';

async function fetchModules() {
  const { modules } = await $fetch(
    `https://api.nuxt.com/modules?version=all`
  );
  return modules;
}
function checkNuxtCompatibility(module, nuxtVersion) {
  if (!module.compatibility?.nuxt) {
    return true;
  }
  return satisfies(nuxtVersion, module.compatibility.nuxt, {
    includePrerelease: true
  });
}
async function getNuxtVersion(cwd) {
  const nuxtPkg = await readPackageJSON("nuxt", { url: cwd }).catch(() => null);
  if (nuxtPkg) {
    return nuxtPkg.version;
  }
  const pkg = await readPackageJSON(cwd);
  const pkgDep = pkg?.dependencies?.nuxt || pkg?.devDependencies?.nuxt;
  return pkgDep && coerce(pkgDep)?.version || "3.0.0";
}
function getRegistryFromContent(content, scope) {
  try {
    const npmConfig = parseINI(content);
    if (scope) {
      const scopeKey = `${scope}:registry`;
      if (npmConfig[scopeKey]) {
        return npmConfig[scopeKey].trim();
      }
    }
    if (npmConfig.registry) {
      return npmConfig.registry.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export { getRegistryFromContent as a, checkNuxtCompatibility as c, fetchModules as f, getNuxtVersion as g };
