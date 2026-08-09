from soma_api.simulation import RemodelInput, calculate_remodeling


def test_simulation_calculates_budget_roi_and_payback():
    result = calculate_remodeling(
        RemodelInput(
            area_m2=100,
            units=2,
            tier="standard",
            acquisition_cost=300_000_000,
            monthly_rent_per_unit=2_000_000,
            monthly_operating_expenses=500_000,
        )
    )

    assert result["construction"]["base"] == 260_000_000
    assert result["investment"]["total"] > result["construction"]["total"]
    assert result["income"]["net_annual"] > 0
    assert result["returns"]["annual_roi_pct"] > 0
    assert result["returns"]["payback_years"] > 0


def test_simulation_rejects_negative_operating_inputs():
    try:
        calculate_remodeling(
            RemodelInput(
                area_m2=100,
                units=2,
                tier="standard",
                acquisition_cost=-1,
                monthly_rent_per_unit=0,
            )
        )
    except ValueError as error:
        assert "negativos" in str(error)
    else:
        raise AssertionError("Expected negative input validation")
