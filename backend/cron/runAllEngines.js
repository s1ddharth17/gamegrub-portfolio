const { runAllEnginesOnce } = require("./worker");
const { logger } = require("../utils/logger");

const runAllLogger = logger.child({ component: "cron", engine: "run_all" });

runAllEnginesOnce()
  .then(() => process.exit(0))
  .catch((error) => {
    runAllLogger.error("cron_run_all_failed", { error });
    process.exit(1);
  });
