
function [Ixx, Iyy, A, ratio, coeff] = isection_conrod(t, BR, HR)

    if HR < 2
        error('H/t must be >= 2 so that h = H - 2*t is non-negative.');
    end
    if BR <= 0 || t <= 0
        error('B/t and t must be positive.');
    end

    % dimensions
    B = BR * t; %F1
    H = HR * t; %F2

    % web height and inner width used in Ixx
    h = H - 2*t;   %F3 web height
    b = h;         % inner width for Ixx

    % area: two flanges + web
    A   = 2*(B*t) + h*t; %F4

    % second moments
    Ixx = (B*H^3 - b*h^3)/12; %F5
    Iyy = 2*(t*B^3)/12 + (h*t^3)/12;%F6

    % ratio
    ratio = Ixx / Iyy;

    % coefficients (dimensionless w.r.t. t)
    coeff.A2    = A   / (t^2);
    coeff.Ixx4  = Ixx / (t^4);
    coeff.Iyy4  = Iyy / (t^4);
    coeff.ratio = ratio;
end
