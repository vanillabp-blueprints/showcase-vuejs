// Starts the simulator on the port of SIMULATOR_PORT, for Playwright's webServer.
import { startSimulator } from './simulator.ts';

const simulator = await startSimulator({ port: Number(process.env.SIMULATOR_PORT ?? 8099) });
console.log(`simulator listening on 127.0.0.1:${simulator.port}`);
