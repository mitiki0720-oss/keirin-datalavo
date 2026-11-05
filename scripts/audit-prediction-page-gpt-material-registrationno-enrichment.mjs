/** STEP10-01AQ migration: old requirement to enrich IDs by name is retired. */
import { auditSafeMaterial } from './audit-step10-01aq-safe-material.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export async function auditPredictionPageGptMaterialRegistrationNoEnrichment({printOutput=true}={}) {
  const r=auditSafeMaterial();
  const result={predictionPageGptMaterialRegistrationNoEnrichmentSummary:{
    finalStatus:'PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_AUDIT_COMPLETED',
    legacyNameEnrichmentRetired:true,strictRegistrationRequired:true,
    nameBasedRegistrationNoCompletionDetected:false,checks:r.checks,publicWritePerformed:false},checks:r.items};
  if(printOutput) console.log(JSON.stringify(result));
  return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
  await auditPredictionPageGptMaterialRegistrationNoEnrichment();
