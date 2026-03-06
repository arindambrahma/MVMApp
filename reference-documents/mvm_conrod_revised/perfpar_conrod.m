
function [V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total, M_total] = ...
perfpar_conrod(rho, lc, A_t, t_req,...
l_capr, db_req, l_b,...
d_boreq, Nb, ...
ds_req, l_sen, ...
tcap_req)


A_req = (A_t*(t_req^2));

V_rod = lc*A_req; %F23
M_rod = V_rod*rho/1000000000; %F24

V_be = (l_capr*(2*db_req)*l_b)-(pi*(db_req^2)*l_b/4); %F25
M_be = V_be*rho/1000000000;%F26

V_bolt= 1.5*pi*(d_boreq^2)*l_b*Nb/4;%F27
M_bolt = V_bolt*rho/1000000000;%F28

V_se = pi*(ds_req^2)*l_sen/4;%F29
M_se = V_se*rho/1000000000;%F30

V_cap = l_capr*tcap_req*tcap_req;%F31
M_cap = V_cap*rho/1000000000;%F32


M_total = M_rod+M_be+M_se+M_cap+M_bolt;%F33
V_total = V_rod+V_be+V_se+V_cap+V_bolt;%F34

end