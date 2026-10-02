/** Restores the demo data to the original seed. Stop the app, run `node reset-demo.js`, start it again. */
require("./seed-install.js")
  .installSeed(__dirname, { force: true })
  .then(() => console.info("demo data restored; start the app again"));
