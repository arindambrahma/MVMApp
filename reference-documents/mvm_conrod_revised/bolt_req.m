function [Ab_req, Fi, d_boreq, Bolt_dia_dec, Bolt_area_decided] = bolt_req( ...
    r, Wr, n, lc, Csteel, Nb, sig_bolt_allow, varargin)
%BOLT_REQ  Required bolt area; optionally select next larger bolt from Excel (no table outputs).
%   [Ab_req, Fi, Bolt_dec, Bolt_dia_dec, Bolt_area_decided] = bolt_req(...)
%   Name-value options (all optional):
%     'SelectBolt' (logical)  : true → read Excel & select bolt (default: false)
%     'Excel'      (char/str) : path to Excel file (default: 'Conrod.xlsx')
%     'Sheet'      (scalar)   : sheet index (default: 3)
%     'Area'       (char/str) : 'Stress' (threaded) or 'Gross' (shank). Default: 'Stress'
%
%   Outputs:
%     Ab_req              : required area (mm^2) per your formula
%     Fi                  : inertia load (N)
%     Bolt_dec            : required equivalent diameter (mm) = sqrt(4*Ab_req/pi)
%     Bolt_dia_dec        : selected nominal diameter d (mm) from Excel (NaN if SelectBolt=false)
%     Bolt_area_decided   : selected area (mm^2) from Excel (NaN if SelectBolt=false)

    % ---------- Original sizing (unchanged) ----------
    Fi  = 4.03e-3 * r * (n^2) * Wr * (1 + (r/lc));  % F18
    Fin = Fi/2;%F18
    Ab_req = (Fin/Csteel)^(1/1.418); % F19

    % Required equivalent diameter (reference)
    d_boreq = sqrt(4*Ab_req/pi); % F20

    % ---------- Parse optional selection params ----------
    p = inputParser;
    addParameter(p, 'SelectBolt', false, @(x)islogical(x) && isscalar(x));
    addParameter(p, 'Excel', 'Conrod.xlsx', @(x)ischar(x) || isstring(x));
    addParameter(p, 'Sheet', 3, @(x)isnumeric(x) && isscalar(x) && x>=1);
    addParameter(p, 'Area',  'Stress', @(x) any(strcmpi(x, {'Stress','Gross'})) );
    parse(p, varargin{:});
    opt = p.Results;

    % Defaults if we don't select
    Bolt_dia_dec = NaN;
    Bolt_area_decided = NaN;

    if ~opt.SelectBolt
        return;
    end

    % ---------- Read the sheet (robust to multi-row headers) ----------
    C = readcell(opt.Excel, 'Sheet', opt.Sheet);

    [nR, nC] = size(C);
    isText  = @(x) (ischar(x) || isstring(x));
    normtxt = @(s) lower(strtrim(regexprep(string(s), '\s+', ' ')));

    % Target headers present in Sheet 3:
    %   - "Nominal diameter" (d [mm])
    %   - "Stress area (threaded part)"  OR  "Gross area (unthreaded part)"
    % (These are present in your Sheet 3 table.)  [1](https://chalmers-my.sharepoint.com/personal/brahma_chalmers_se/_layouts/15/Doc.aspx?sourcedoc=%7BB506F45A-B267-4609-B60E-CC8C6A0CB159%7D&file=Conrod.xlsx&action=default&mobileredirect=true)
    wantStress = strcmpi(opt.Area, 'Stress');
    if wantStress
        areaKey = "stress area";
    else
        areaKey = "gross area";
    end

    dCol = NaN; areaCol = NaN; dHeaderRow = NaN; aHeaderRow = NaN;

    for rRow = 1:nR
        for cCol = 1:nC
            v = C{rRow,cCol};
            if isText(v)
                t = normtxt(v);
                if isnan(dCol) && (contains(t, "nominal diameter") || contains(t, "d [mm]"))
                    dCol = cCol; dHeaderRow = rRow;
                end
                if isnan(areaCol) && contains(t, areaKey)  % matches "stress area" or "gross area"
                    areaCol = cCol; aHeaderRow = rRow;
                end
            end
        end
        if ~isnan(dCol) && ~isnan(areaCol)
            break;
        end
    end

    if isnan(dCol) || isnan(areaCol)
        error('Could not find "Nominal diameter" and "%s" area columns on sheet %d of %s.', ...
              opt.Area, opt.Sheet, opt.Excel);
    end

    headerRow = max([dHeaderRow, aHeaderRow]);  % data start is below the lower header

    % ---------- Collect numeric rows (d, Area) ----------
    rawD = C(headerRow+1:end, dCol);
    rawA = C(headerRow+1:end, areaCol);

    D = []; A = [];
    for k = 1:numel(rawD)
        dVal = rawD{k};
        aVal = rawA{k};

        if isText(dVal), dVal = str2double(string(dVal)); end
        if isText(aVal), aVal = str2double(string(aVal)); end

        if isnumeric(dVal) && isnumeric(aVal) && ~isnan(dVal) && ~isnan(aVal)
            D(end+1,1) = double(dVal); %#ok<AGROW>
            A(end+1,1) = double(aVal); %#ok<AGROW>
        end
    end

    if isempty(A)
        error('No numeric rows found for d and %s area on sheet %d.', opt.Area, opt.Sheet);
    end

    % ---------- Pick the next larger bolt by area ----------
    [A_sorted, idxSort] = sort(A, 'ascend');
    D_sorted = D(idxSort);

    idx = find(A_sorted >= Ab_req, 1, 'first');
    if isempty(idx)
        error('Required area %.2f mm^2 exceeds the largest value in the sheet (%.2f mm^2 for d=%g).', ...
              Ab_req, A_sorted(end), D_sorted(end));
    end

    Bolt_dia_dec = D_sorted(idx);
    Bolt_area_decided = A_sorted(idx);

    % Optional: quick console note
    % fprintf('→ Bolt d=%g mm, Area=%g mm^2 (%s), required=%.2f mm^2\n', ...
    %     Bolt_dia_dec, Bolt_area_decided, opt.Area, Ab_req);
end