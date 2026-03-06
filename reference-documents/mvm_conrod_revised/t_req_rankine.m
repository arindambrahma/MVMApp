function [t_req, H_req, B_req, h_req, b_req, A_req, n, r, W, C] = t_req_rankine(Fp, sig_y_mat, FOS, K_rankine, lc, A_coeff, Ixx_coeff, HR, BR, N_rpm, overspeed, ls, rho)
% Solves Rankine formula for thickness t
% Returns all 4 roots of the quartic equation
% Allowable stress
fe = sig_y_mat / FOS; %F8
% Constant appearing in the equation
C = K_rankine * lc^2 * (A_coeff / Ixx_coeff); %F9

% Polynomial coefficients for:
% A_coeff*fe*t^4 - Fp*t^2 - Fp*C = 0        %F10
p = [ ...
    A_coeff*fe, ...   % t^4
    0, ...            % t^3
    -Fp, ...          % t^2
    0, ...            % t
    -Fp*C ];          % constant

% Solve polynomial
t = roots(p);
t_req = t(imag(t)==0 & real(t)>0);
H_req = t_req*HR;
B_req = t_req*BR;
h_req = H_req-(2*t_req);
b_req = (B_req-t_req)/2;
A_req = (A_coeff*(t_req^2));

n = (N_rpm*(1+overspeed))/60; %F11
r = ls/2; %F12
W = rho*9.81; %F13
C = H_req/2; %F14
end
