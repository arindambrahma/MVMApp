%% MVM_Conrod.m
% Full MVM for a high-speed petrol engine connecting rod.
% Method captures Brahma & Wynn (2020)
clear; clc;
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% INPUTS
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Core sizes / kinematics
lc        = 400;    %1 conrod length [mm]
D_p        = 120;    %2 piston dia [mm]
W_r        = 25;     %3 weight of reciprocating parts [N]
l_s        = 160;    %4 stroke [mm]
N     = 2000;   %5 normal speed [rpm]
N_prime = 0.50;   %6 50% possible N_prime (fraction)
comp      = 6;      %7 compression ratio
sigma_yp = 316;    %8 chosen material yield [MPa]
P_max      = 3.0;    %9 peak cylinder pressure [MPa]
K = 1.6e-4; %10 Rankine constant (mm units)
S       = 5;      %11 design factor
rho       = 7280;   %12 density [kg/m^3]

sigma_bolt = 500;%13 allowable bolt stress [MPa]
% I-section coefficients from ratios, e.g., B/t = 4, H/t = 5
B_R = 4;            %14 B/t
H_R = 5;            %15 H/t
l_db	= 1.3; %16 (Can be between 1.25-1.5)
P_bb	= 6.5;	   %17   (Can be between 5-10N/mm2)
l_ds = 1.5;   %18	(can be between 1.5-2)
P_bs = 16;	   %19 small end bearing pressure N/mm2 Can be between 10-20N/mm2
C_bolt    = 2.29;  %20 Bolt Capacity Factor; inertia-load constant used in bolt sizing (steel)

%Other preliminary calculators
hR = 3;            %
t_unit = 1;        % use t = 1 to extract dimensionless coefficients
[~,~,~,ratio_sec,Csec] = isection_conrod(t_unit, B_R, H_R);


A_t   = Csec.A2;      % A   = A_t   * t^2
Ixx_coeff = Csec.Ixx4;    % Ixx = Ixx_coeff * t^4
Iyy_coeff = Csec.Iyy4;    % Iyy = Iyy_coeff * t^4
% (Optional) keep ratio if you need to display/check it:
Ixx_over_Iyy = ratio_sec; % 

N_b = 2; %Number of bolts
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%I-section Thickness Calculations
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% --- Max piston load on conrod (N) ---
% D_p in mm, P_max in MPa (1 MPa = 1 N/mm^2), result F_p is in Newtons
F_p = pi*(D_p.^2)/4 .* P_max; %F7

kxx2 = Ixx_coeff ./ A_t;




%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Required Value Calculations
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
[t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq, l_b] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq, l_sen] = small_end(F_p, P_bs, l_ds);%Small end
[Ab_req, F_i, d_boreq, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Decided Values
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Decided value of I section
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

t_dec = 2 * ceil(t_req/2);
%Calculating the dimensions of the I section based on calculated t
H_dec = t_dec*H_R;
B_dec = t_dec*B_R;
h_dec = H_dec-(2*t_dec);
b_dec = (B_dec-t_dec)/2;
A_dec = (A_t*(t_dec^2));
%Compressive Stress
sig_comp = F_p/A_dec;
%weight density of conrod

Z = (Ixx_coeff*(t_req^4))/C;
sig_b= 0.2584*10^(-12)*(n^2)*r*A_req*W*(lc^2)/Z;
sig_resultant = sig_b+sig_comp;

FOS_check = sigma_yp/sig_resultant;
% Ensure FOS_check >= 3 by increasing t_dec in 1 mm steps (catalog steps optional)

targetFOS = 3.0;     % required factor of safety
maxIter   = 100;     % guard against infinite loops
iter      = 0;

% Start from your current decision (already rounded up)
t_cur = t_dec;

while true
    iter = iter + 1;
    if iter > maxIter
        error('FOS loop: exceeded %d iterations. Check inputs/units.', maxIter);
    end

    % --- Geometry at current decided thickness (reporting only)
    H_dec = H_R * t_cur;
    B_dec = B_R * t_cur;
    % If your inner geometry is parametric by t, keep using these:
    h_dec = H_dec - 2*t_cur;
    b_dec = (B_dec - t_cur)/2;

    % --- Section properties from coefficients (keeps A = A_t*t^2, Ixx = Ixx_coeff*t^4)
    A_dec   = A_t   * (t_cur^2);     % [mm^2]
    Ixx_dec = Ixx_coeff * (t_cur^4);     % [mm^4]
    Z_dec   = Ixx_dec / (H_dec/2);       % [mm^3]

    % --- Stresses at current thickness
    sig_comp = F_p / A_dec;               % MPa (N/mm^2)

    n = N * (1 + N_prime) / 60;    % rps
    r = l_s/2;                            % mm
    Wdens = rho * 9.81;                  % N/m^3
    % Your bending formula (unit-calibrated constant)
    sig_b = 0.2584e-12 * (n^2) * r * A_dec * Wdens * (lc^2) / Z_dec; % MPa

    sig_resultant = sig_comp + sig_b;    % MPa
    FOS_check = sigma_yp / sig_resultant;

    % --- Stop if requirement is satisfied
    if FOS_check >= targetFOS
        t_dec = t_cur;                   % accept this thickness
        break;
    end

    % --- Otherwise, increase thickness by 1 mm and try again
    t_cur = t_cur + 1;                   % (or jump to next catalog size instead)
end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Big End Decided value
d_bdec = 2*ceil((d_breq + 1)/2) - 1;
l_bdec = 2*ceil((l_b + 1)/2) - 1;
% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% %Small End Decided value
d_sdec = 2*ceil((d_sreq + 1)/2) - 1;
l_sdec = 2*ceil((l_sen + 1)/2) - 1;
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Cap for big end decided value
t_capd = 2 * ceil(t_capr/2)+2;
% 
% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% %Calculate Performance Parameters considering all decided values
% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total, M_total] = ...
perfpar_conrod(rho, lc, A_t, t_dec,...
l_capr, d_bdec, l_bdec,...
A_bdec, N_b, ...
d_sdec, l_sdec, ...
t_capd);
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%
%Excess calculation
%%%%%%%%%%%%%%%%%%%%%%%%%%

E1 = (t_dec-t_req)/t_req;
E2 = (d_bdec - d_breq)/d_breq;
E3 = (d_sdec - d_sreq)/d_sreq;
E4 = (A_bdec - Ab_req)/Ab_req;
E5 = (t_capd - t_capr)/t_capr;

Excess_m = [E1;E2;E3;E4;E5];
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Impact
% E1 -- t_dec/t_req 
% E2 -- d_bdec/d_breq
% E3 -- d_sdec/d_sreq
% E4 -- A_bdec/Ab_req
% E5 -- t_capd/t_capr
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%At E1, all but t_req is maintained at decided values
[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total_E1, M_total_E1] = ...
perfpar_conrod(rho, lc, A_t, t_req,... % Change t_req for E1
l_capr, d_bdec, l_bdec,...% Change d_breq and l_b for E2
d_bod, N_b, ... % Change d_boreq to d_bod for E4
d_sdec, l_sdec, ... % Change d_sreq/l_sen to d_sdec/l_sdec for E3
t_capd);% Change t_capr to t_capd for E5
I_E1 = [(V_total-V_total_E1)/V_total_E1, (M_total-M_total_E1)/M_total_E1];

%At E2, all but d_bdec is maintained at decided values
[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total_E2, M_total_E2] = ...
perfpar_conrod(rho, lc, A_t, t_dec,... % Change t_req for E1
l_capr, d_breq, l_b,...% Change d_breq and l_b for E2
d_bod, N_b, ... % Change d_boreq to d_bod for E4
d_sdec, l_sdec, ... % Change d_sreq/l_sen to d_sdec/l_sdec for E3
t_capd);% Change t_capr to t_capd for E5
I_E2 = [(V_total-V_total_E2)/V_total_E2, (M_total-M_total_E2)/M_total_E2];


%At E3, all but d_sdec is maintained at decided values
[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total_E3, M_total_E3] = ...
perfpar_conrod(rho, lc, A_t, t_dec,... % Change t_req for E1
l_capr, d_bdec, l_bdec,...% Change d_breq and l_b for E2
d_bod, N_b, ... % Change d_boreq to d_bod for E4
d_sreq, l_sen, ... % Change d_sreq/l_sen to d_sdec/l_sdec for E3
t_capd);% Change t_capr to t_capd for E5
I_E3 = [(V_total-V_total_E3)/V_total_E3, (M_total-M_total_E3)/M_total_E3];

%At E4, all but d_boreq is maintained at decided values
[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total_E4, M_total_E4] = ...
perfpar_conrod(rho, lc, A_t, t_dec,... % Change t_req for E1
l_capr, d_bdec, l_bdec,...% Change d_breq and l_b for E2
d_boreq, N_b, ... % Change d_boreq to d_bod for E4
d_sdec, l_sdec, ... % Change d_sreq/l_sen to d_sdec/l_sdec for E3
t_capd);% Change t_capr to t_capd for E5
I_E4 = [(V_total-V_total_E4)/V_total_E4, (M_total-M_total_E4)/M_total_E4];

%At E5, all but t_capr is maintained at decided values
[V_rod, M_rod,  ...
    V_be,M_be, ...
    V_se,M_se, ...
   V_bolt, M_bolt, ...
    V_cap,M_cap, ...
    V_total_E5, M_total_E5] = ...
perfpar_conrod(rho, lc, A_t, t_dec,... % Change t_req for E1
l_capr, d_bdec, l_bdec,...% Change d_breq and l_b for E2
d_bod, N_b, ... % Change d_boreq to d_bod for E4
d_sdec, l_sdec, ... % Change d_sreq/l_sen to d_sdec/l_sdec for E3
t_capr);% Change t_capr to t_capd for E5
I_E5 = [(V_total-V_total_E5)/V_total_E5, (M_total-M_total_E5)/M_total_E5];

% %Ipact matrix
Impact_mj = [I_E1;I_E2;I_E3;I_E4;I_E5];

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Deterioration
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%To calculate deterioration, the entire calculation is put in a while loop
%while iterating one of the input parameters at a time. The conditions in
%the while loop are put in place so that Pmaxi is calculated so that none
%of the decisions need to be changed.
% E1 -- t_dec/t_req 
% E2 -- d_bdec/d_breq
% E3 -- d_sdec/d_sreq
% E4 -- A_bdec/Ab_req
% E5 -- t_capd/t_capr

N_ctr=N;
while t_req	< t_dec 	&&	d_breq	<	d_bdec 	&&	d_sreq	<	d_sdec 	&&	Ab_req	<	A_bdec 	&&	t_capr	<	t_capd
 %Iterating input parameter till any of the decisions have to be changed.
    N_ctr=N_ctr+1;
[t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N_ctr, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq, l_b] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq, l_sen] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req, F_i, d_boreq, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap
end
N_max=N_ctr; %This is the max val of W, which does not require anything to change, considering motor

%Reinstating all the values
[t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq, l_b] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq, l_sen] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req, F_i, d_boreq, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap


P_max_ctr=P_max;
while t_req	< t_dec 	&&	d_breq	<	d_bdec 	&&	d_sreq	<	d_sdec 	&&	Ab_req	<	A_bdec 	&&	t_capr	<	t_capd
 %Iterating input parameter till any of the decisions have to be changed.
    P_max_ctr=P_max_ctr+0.1;
F_p = pi*(D_p.^2)/4 .* P_max_ctr;
kxx2 = Ixx_coeff ./ A_t;
[t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq, l_b] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq, l_sen] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req, F_i, d_boreq, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap
end
P_max_max=P_max_ctr; %This is the max val of W, which does not require anything to change, considering motor

%Reinstating all the values
F_p = pi*(D_p.^2)/4 .* P_max;
kxx2 = Ixx_coeff ./ A_t;
[t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq, l_b] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq, l_sen] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req, F_i, d_boreq, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap

%Deteriorations
Deterioration_N=(N_max-N)/N_max;
Deterioration_Pmax= (P_max_max-P_max)/P_max_max;

%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Absorption_m
%%%%%%%%%%%%%%%%%%%%%%%%%%%

%To calculate absorption the corresponding new values of inputs are used to
%recalculate the entire MAN, these inputs correspond to the PMaxi values
%calculated previously.

%N=N_max also replacing the threshold variables with new ones


F_p = pi*(D_p.^2)/4 .* P_max;
kxx2 = Ixx_coeff ./ A_t;
[t_req_new, H_req_new, B_req_new, h_req_new, b_req_new, A_req_new, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N_max, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq_new, lb_req_new] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq_new, ls_req_new] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req_new, F_i, Bolt_req_new, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr_new, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap

%% 
Absorption_N= [(t_dec-t_req)/(t_req*Deterioration_N);
(d_bdec - d_breq)/(d_breq*Deterioration_N);
(d_sdec - d_sreq)/(d_sreq*Deterioration_N);
(A_bdec - Ab_req)/(Ab_req*Deterioration_N);
(t_capd - t_capr)/(t_capr*Deterioration_N)];

t_req_new = 0; 
d_breq_new = 0;
d_sreq_new = 0;
Ab_req_new = 0;
t_capr_new = 0;
H_req_new = 0;
B_req_new= 0;
h_req_new= 0;
b_req_new= 0;
A_req_new= 0;
% % E1 -- t_dec/t_req 
% % E2 -- d_bdec/d_breq
% % E3 -- d_sdec/d_sreq
% % E4 -- A_bdec/Ab_req
% % E5 -- t_capd/t_capr

%P_rpm=N_max also replacing the threshold variables with new ones

F_p = pi*(D_p.^2)/4 .* P_max_max;
kxx2 = Ixx_coeff ./ A_t;
[t_req_new, H_req_new, B_req_new, h_req_new, b_req_new, A_req_new, n, r, W, C] = t_req_rankine(F_p, sigma_yp, S, K, lc, A_t, Ixx_coeff, H_R, B_R, N, N_prime, l_s, rho);% Extract physical solution(s)
[d_breq_new, lb_req_new] = big_end(F_p, P_bb, l_db); %Big End
[d_sreq_new, ls_req_new] = small_end(F_p, P_bs, l_ds); %Small end
[Ab_req_new, F_i, Bolt_req_new, d_bod, A_bdec] = bolt_req( ...
    r, W_r, n, lc, C_bolt, N_b, sigma_bolt, ...
    'SelectBolt', true, ...
    'Excel', 'Conrod.xlsx', ...
    'Sheet', 3, ...
    'Area', 'Stress'); %Bolt selection
[t_capr_new, l_capr] = cap_req(F_i,d_breq,d_boreq,sigma_yp); %Big end cap

t_req_new = 0; 
d_breq_new = 0;
d_sreq_new = 0;
Ab_req_new = 0;
t_capr_new = 0;
H_req_new = 0;
B_req_new= 0;
h_req_new= 0;
b_req_new= 0;
A_req_new= 0;

% E1 -- t_dec/t_req 
% E2 -- d_bdec/d_breq
% E3 -- d_sdec/d_sreq
% E4 -- A_bdec/Ab_req
% E5 -- t_capd/t_capr

Absorption_Pmax= [(t_dec-t_req)/(t_req*Deterioration_Pmax);
(d_bdec - d_breq)/(d_breq*Deterioration_Pmax);
(d_sdec - d_sreq)/(d_sreq*Deterioration_Pmax);
(A_bdec - Ab_req)/(Ab_req*Deterioration_Pmax);
(t_capd - t_capr)/(t_capr*Deterioration_Pmax)];
%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%Absorption_m matrix calculations
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

Absorption_im=[Absorption_N Absorption_Pmax];
%%
%Calculating Impact_m and absorption according to weightage/liklihood
W_j1=1;
W_j2=1;

Impact_m=Impact_mj*[W_j1;W_j2]/(W_j1+W_j2); %Converts into a 1D matrix

%%
L_i1=1;
L_i2=1;
Absorption_m=Absorption_im*[L_i1;L_i2]/(L_i1+L_i2); %Converts into a 1D matrix.
%Note that the actual absorption matrix is a 1x9 matrix. i.e. (.') of the result. 
%scatter(Impact_m, Absorption_m, 'filled')
% Margin Value Plot
bubblechart(Impact_m, Absorption_m, Excess_m)
xlabel('Undesirable impact on performance parameters (Impact in %)')
ylabel('Change absorption potential (Absorption in %)')
hold on