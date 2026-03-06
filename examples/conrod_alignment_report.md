# Conrod MATLAB Alignment Check

## Files
- Original app example: `examples/man_diagram_conrod.json`
- MATLAB-aligned app copy: `examples/man_diagram_conrod_matlab_aligned.json`
- MATLAB reference metrics: `reference-documents/mvm_conrod_revised/mvm_conrod_revised/MVM_Conrod_metrics_revised.csv`

## Change applied in aligned copy
- Set input `BR` from `5` to `4` (to match MATLAB `B_R = 4`).

## Backend results (app)
### Original app JSON
- Excess: E1=0.303985, E2=0.026042, E3=0.037513, E4=0.164900, E5=0.271398
- Weighted Impact: E1=0.138769, E2=0.022648, E3=0.003371, E4=0.029632, E5=0.000216
- Weighted Absorption: E1=0.217890, E2=0.246787, E3=0.246787, E4=0.341204, E5=0.500000

### MATLAB-aligned app copy (`BR=4`)
- Excess: E1=0.204536, E2=0.026042, E3=0.037513, E4=0.164900, E5=0.271398
- Weighted Impact: E1=0.088741, E2=0.023753, E3=0.003532, E4=0.031089, E5=0.000227
- Weighted Absorption: E1=0.219301, E2=0.246787, E3=0.246787, E4=0.341204, E5=0.500000

## MATLAB revised CSV values
- Excess: E1=3.130255, E2=0.025782, E3=0.037250, E4=0.125397, E5=0.158031
- Impact: E1=0.005661, E2=0.007607, E3=0.000029, E4=0.262798, E5=0.000002
- Absorption: NaN, NaN, NaN, NaN, NaN

## Remaining mismatch drivers
- App conrod graph models E4 using bolt diameter (`Boltd_req`) while MATLAB revised script/formulation uses bolt area path (`Ab_req`/selected area), so E4 impact/excess trends differ.
- MATLAB revised script includes spreadsheet-driven bolt selection (`SelectBolt=true`) and logic not represented in the app graph JSON.
- MATLAB revised script’s Metric-3 section computes NaN absorption in the CSV output; app backend computes absorption using manuscript equation.
