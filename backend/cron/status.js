require("dotenv").config({ quiet: true });

const { getCronHealthSnapshot } = require("./monitor");
const { logger } = require("../utils/logger");

const statusLogger = logger.child({ component: "cron", engine: "status" });

getCronHealthSnapshot()
  .then((snapshot) => {
    console.log(JSON.stringify(snapshot, null, 2));
    process.exit(snapshot.status === "ok" ? 0 : 1);
  })
  .catch((error) => {
    statusLogger.error("cron_status_failed", { error });
    process.exit(1);
  });
