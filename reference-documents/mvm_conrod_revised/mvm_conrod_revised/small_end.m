function [ds_req, l_sen] = small_end(Fp, Pb_small, lds_ratio)
ds_req = sqrt( Fp / (Pb_small * lds_ratio) ); %F16
l_sen = lds_ratio*ds_req; %F17
end

