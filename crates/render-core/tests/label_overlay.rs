use render_core::{
    constants::constants,
    overlay::clock_panel_bounds,
    rotated_text::{RotatedText, TextStyle},
    text::Text,
};

#[test]
fn rotated_labels_and_halos_do_not_intersect_the_clock_panel() {
    let size = &constants().size;
    let mut text = Text::new().unwrap();
    let bounds = clock_panel_bounds(&mut text, "Gevoels-\ntemperatuur");
    assert_eq!(
        clock_panel_bounds(&mut text, "Regenradar"),
        [0.0, 107.0, 200.0, 261.0]
    );
    let original = vec![25; size.width * size.height * 3];
    let mut labels = RotatedText::new().unwrap();
    let style = || TextStyle {
        size: 17,
        color: [255; 3],
        halo: [0; 3],
        opacity: 1.0,
    };
    let center = [bounds[2] - 5.0, bounds[3] - 5.0];
    let mut visible = original.clone();
    labels.draw(&mut visible, "9°", center, 45.0, style());
    assert_ne!(visible, original);
    let mut excluded = original.clone();
    labels.draw_excluding(&mut excluded, "9°", center, 45.0, style(), Some(bounds));
    assert_eq!(excluded, original);
    labels.draw_excluding(
        &mut excluded,
        "9°",
        [bounds[2] + 40.0, bounds[3] + 40.0],
        45.0,
        style(),
        Some(bounds),
    );
    assert_ne!(excluded, original);
    for row in bounds[1] as usize..bounds[3] as usize {
        let start = row * size.width * 3;
        let end = start + bounds[2] as usize * 3;
        assert_eq!(excluded[start..end], original[start..end]);
    }
    let mut above = original.clone();
    labels.draw_excluding(&mut above, "9°", [100.0, 60.0], 0.0, style(), Some(bounds));
    assert_ne!(above, original);
}
