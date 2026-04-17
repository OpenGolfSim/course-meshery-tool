// import SVGWorker from './svg.worker.js';
// import MeshWorker from './mesh.webworker.js';

// const handleWorkerMessage = (msg) => {
//   console.log('worker message', msg);
// }

// const handleWorkerError = (error) => {
//   console.log('worker error', error);
// }

const startWorkerJob = (_event, job) => {
  console.log('start worker!', job);
//   const worker = new SVGWorker();
//   worker.addEventListener('message', handleWorkerMessage);
//   worker.addEventListener('error', handleWorkerError);
//   worker.postMessage(job);
}

(() => {
  window.ogs_worker.onStartJob(startWorkerJob);
})();

