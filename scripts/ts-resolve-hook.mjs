// Lets node:test load lib/ modules that use extensionless relative imports
// (the bundler-style resolution Next.js uses) by retrying with a .ts suffix.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (!relative || /\.[cm]?[jt]sx?$/.test(specifier)) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
