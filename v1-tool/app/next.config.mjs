/** The skills folder, the brand config and the post graphics' fonts are read at request time, so ship them with the API
 * routes. SCHEDULER is passed to the pages too, so they name the scheduler the studio sends to. */
export default {
  outputFileTracingIncludes: { "/api/**/*": ["./skills/**/*", "./assets/postcard/**/*", "./brand/**/*"] },
  env: { NEXT_PUBLIC_SCHEDULER: process.env.SCHEDULER || "export" },
};
