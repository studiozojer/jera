// EAS project/signing metadata only. Exact owns the app and native build.
module.exports = {
  expo: {
    name: 'Jera', slug: 'jera', owner: 'schultzdavidg', version: '0.1.0',
    ios: {
      bundleIdentifier: 'studio.zojer.jera.exact',
      buildNumber: process.env.EXACT_BUILD_NUMBER || '1',
      associatedDomains: ['webcredentials:jera.ink'],
    },
    extra: { eas: { projectId: '180cdb3c-fa7e-4664-96b0-ed750d57c167' } },
  },
};
