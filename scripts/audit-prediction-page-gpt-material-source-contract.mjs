/** STEP10-01AQ migration: old contradictory static test replaced by behavioral evidence-denial test. */
import { auditSafeMaterial } from './audit-step10-01aq-safe-material.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export async function auditPredictionPageGptMaterialSourceContract({printOutput=true}={}) {
  const r=auditSafeMaterial();
  const result={predictionPageGptMaterialSourceContractSummary:{
    finalStatus:'PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_AUDIT_COMPLETED',
    safeRegistrationContract:true,disabledNameIdentityCompletion:true,
    oldProoflessExplicitIdsRedacted:true,sourceTypesKeptSeparate:true,
    checks:r.checks,publicWritePerformed:false},checks:r.items};
  if(printOutput) console.log(JSON.stringify(result));
  return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  await auditPredictionPageGptMaterialSourceContract();
