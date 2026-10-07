node_keys = { "place" }
way_keys = { "natural", "landuse", "waterway", "boundary" }

function node_function()
    local kind = Find("place")
    if kind ~= "country" and kind ~= "state" and kind ~= "city" and kind ~= "town" and kind ~= "village" then return end
    local name = Find("name:nl")
    if name == "" then name = Find("name") end
    if name == "" then return end
    local population = tonumber(Find("population")) or 0
    local rank = 6
    local minimum_zoom = 9
    if kind == "country" then rank = 0; minimum_zoom = 4
    elseif kind == "state" then rank = 1; minimum_zoom = 5
    elseif population >= 150000 then rank = 2; minimum_zoom = 5
    elseif kind == "city" or population >= 50000 then rank = 3; minimum_zoom = 6
    elseif kind == "town" or population >= 10000 then rank = 4; minimum_zoom = 7
    else rank = 5; minimum_zoom = 8 end
    Layer("place", false)
    Attribute("name", name)
    Attribute("class", kind)
    AttributeInteger("rank", rank)
    AttributeInteger("population", population)
    MinZoom(minimum_zoom)
    ZOrder(rank)
end

function relation_scan_function()
    local level = tonumber(Find("admin_level"))
    if Find("boundary") == "administrative" and (level == 2 or level == 4) and Find("maritime") ~= "yes" then Accept() end
end

function way_function()
    if Find("maritime") ~= "yes" then
        local level = 99
        if Find("boundary") == "administrative" then level = tonumber(Find("admin_level")) or 99 end
        while true do
            local relation = NextRelation()
            if not relation then break end
            if FindInRelation("maritime") ~= "yes" then level = math.min(level, tonumber(FindInRelation("admin_level")) or 99) end
        end
        if level == 2 or level == 4 then
            Layer("boundary", false)
            AttributeInteger("admin_level", level)
            AttributeInteger("maritime", 0)
        end
    end
    if not IsClosed() then return end
    local natural = Find("natural")
    local landuse = Find("landuse")
    if natural == "water" or Find("waterway") == "riverbank" or landuse == "reservoir" then
        Layer("water", true)
    elseif natural == "wood" or landuse == "forest" then
        Layer("landcover", true)
        Attribute("class", "wood")
    elseif landuse == "residential" or landuse == "commercial" or landuse == "industrial" or landuse == "retail" then
        Layer("landcover", true)
        Attribute("class", "urban")
    end
end

function attribute_function(attributes, layer)
    return {}
end
