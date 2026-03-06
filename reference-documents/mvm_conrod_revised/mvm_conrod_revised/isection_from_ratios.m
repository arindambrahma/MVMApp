
function [Ixx, Iyy, A, ratio, coeff] = isection_from_ratios(t, B_over_t, H_over_t)

    if H_over_t < 2
        error('H/t must be >= 2 so that h = H - 2*t is non-negative.');
    end
    if B_over_t <= 0 || t <= 0
        error('B/t and t must be positive.');
    end

    % dimensions
    B = B_over_t * t;
    H = H_over_t * t;

    % web height and inner width used in Ixx
    h = H - 2*t;   % web height
    b = h;         % inner width for Ixx (matches the Excel setup)

    % area: two flanges + web
    A   = 2*(B*t) + h*t;

    % second moments
    Ixx = (B*H^3 - b*h^3)/12;
    Iyy = 2*(t*B^3)/12 + (h*t^3)/12;

    % ratio
    ratio = Ixx / Iyy;

    % coefficients (dimensionless w.r.t. t)
    coeff.A2    = A   / (t^2);
    coeff.Ixx4  = Ixx / (t^4);
    coeff.Iyy4  = Iyy / (t^4);
    coeff.ratio = ratio;
end
