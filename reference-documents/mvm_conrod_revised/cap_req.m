
function [tcap_req, l_capr] = cap_req(Fi, db_req, d_boreq, sig_y_mat)
% CAP_REQ  Required cap thickness using simple bending proxy.
% M approx 0.25 * Fp * d_big,  t = sqrt( 6*M / (sigma * b) )
l_capr = db_req + (2*3)+ d_boreq+5; %F21

tcap_req = sqrt( (Fi*l_capr)/(db_req*sig_y_mat));%F22
end
