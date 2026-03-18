const express = require("express");
const { healthController } = require("../controllers");

const router = express.Router();

router.get("/", healthController.getHealth);
router.get("/db", healthController.getHealthDatabase);

module.exports = router;
