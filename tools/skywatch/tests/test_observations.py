from skywatch.observations import parse_h5dump_values


def test_parses_string_dataset_from_h5dump() -> None:
    output = '''
HDF5 "sample.nc" {
DATASET "/station" {
   DATA {
      "06240",
      "06260", "06270"
   }
}
}
'''
    assert parse_h5dump_values(output) == ["06240", "06260", "06270"]


def test_uses_nested_subset_data_block() -> None:
    output = '''
DATASET "/qg" {
   SUBSET {
      DATA {
         258
      }
   }
}
'''
    assert parse_h5dump_values(output) == ["258"]
