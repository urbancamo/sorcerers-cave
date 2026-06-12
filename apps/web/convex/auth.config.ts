export default {
  providers: [
    {
      // CONVEX_SITE_URL is auto-injected into the deployment's function runtime.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
