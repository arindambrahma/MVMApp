
function [db_req, l_b] = big_end(Fp, Pb_big, ldb_ratio)
    db_req = sqrt( Fp / (Pb_big * ldb_ratio) ); %F14
    l_b = ldb_ratio*db_req; %F15
end
