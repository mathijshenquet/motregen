node_keys = { "place" }
way_keys = { "natural", "landuse", "leisure", "waterway", "boundary" }

function node_function()
    local kind = Find("place")
    if kind ~= "country" and kind ~= "state" and kind ~= "city" and kind ~= "town" and kind ~= "village" then return end
    local name = Find("name:nl")
    if name == "" then name = Find("name") end
    if name == "" or #name == 1 then return end
    local population_text = Find("population"):gsub("[ ,.;]", "")
    local population = tonumber(population_text) or 0
    local rank = 10
    local minimum_zoom = 6
    if kind == "country" then rank = 0; minimum_zoom = 4
    elseif kind == "state" then rank = 1; minimum_zoom = 5
    elseif population >= 500000 then rank = 3
    elseif population >= 200000 then rank = 4
    elseif population >= 100000 then rank = 5
    elseif population >= 75000 then rank = 6
    elseif population >= 50000 then rank = 7
    elseif population >= 25000 then rank = 8
    elseif population >= 10000 then rank = 9
    elseif kind == "city" and population == 0 then rank = 7 end
    if kind == "city" then minimum_zoom = 4
    elseif kind == "village" then minimum_zoom = 9 end
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
    local leisure = Find("leisure")
    local cover = nil
    if natural == "water" or Find("waterway") == "riverbank" or landuse == "reservoir" then
        Layer("water", true)
        return
    elseif natural == "wood" or landuse == "forest" then cover = "wood"
    elseif natural == "sand" or natural == "beach" then cover = "sand"
    elseif natural == "wetland" then cover = "wetland"
    elseif leisure == "nature_reserve" or Find("boundary") == "national_park" then cover = "park"
    elseif natural == "grassland" or natural == "heath" or natural == "scrub"
        or landuse == "grass" or landuse == "meadow" or landuse == "allotments"
        or landuse == "village_green" or landuse == "recreation_ground"
        or leisure == "park" or leisure == "garden" or leisure == "golf_course" then cover = "grass"
    elseif landuse == "residential" or landuse == "commercial" or landuse == "industrial" or landuse == "retail" then
        cover = "urban"
    end
    if cover then
        Layer("landcover", true)
        Attribute("class", cover)
        -- Unions per ~7 × 11 km behouden kleine aaneengesloten groenvlakken zonder een landelijke union.
        local centroid = Centroid("centroid")
        if centroid then
            local row = math.floor((centroid[1] - 50) / 0.1)
            local column = math.floor((centroid[2] - 2) / 0.1)
            ZOrder(row * 64 + column)
        end
    end
end

function attribute_function(attributes, layer)
    return {}
end
