'use strict';

require('dotenv').config();

const { initializeObservability } = require('./src/utils/observability');

initializeObservability();
