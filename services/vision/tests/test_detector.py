from types import SimpleNamespace
import pytest
from vision.detector import adapt_results, Detector
from vision.temporal import TemporalValidator, inference_max_gap


def detection(category='smoke',confidence=.8):
    return {'category':category,'confidence':confidence,'bbox':[1,2,30,40]}


def test_adapter_maps_class_names():
    tensor=lambda value:SimpleNamespace(tolist=lambda:value)
    result=SimpleNamespace(boxes=SimpleNamespace(xyxy=tensor([[1,2,3,4],[5,6,7,8]]),conf=tensor([.8,.9]),cls=tensor([1,0])))
    assert [r['category'] for r in adapt_results(result,{0:'fire',1:'smoke'})]==['smoke','fire']


def test_adapter_missing_boxes_and_weights():
    assert adapt_results(SimpleNamespace(boxes=None),{})==[]
    with pytest.raises(ValueError,match='tidak ditemukan'):Detector('/no/such/weights.pt')


def test_alerts_as_soon_as_four_real_positives_are_available():
    validator=TemporalValidator()
    for i in range(4):assert validator.add([detection()] if i<3 else [],i)==[]
    result=validator.add([detection()],4)
    assert len(result)==1 and result[0]['category']=='smoke'


def test_negatives_and_low_confidence_do_not_trigger():
    validator=TemporalValidator()
    for i in range(30):assert validator.add([detection(confidence=.59)] if i%2 else [],i)==[]


def test_categories_never_mix_to_reach_threshold():
    validator=TemporalValidator()
    for i in range(6):assert validator.add([detection('smoke' if i%2 else 'fire')],i)==[]


def test_cooldown_and_reset():
    validator=TemporalValidator()
    alerts=[]
    for i in range(70):alerts.extend((i,d) for d in validator.add([detection()],i))
    assert [i for i,_ in alerts]==[3,63]
    validator.reset()
    assert validator.add([detection()],70)==[]


def test_gap_clears_window():
    validator=TemporalValidator()
    for i in range(3):validator.add([detection()],i)
    assert validator.add([detection()],30)==[]


def test_shared_cpu_does_not_expire_every_smoke_sample():
    # Three cameras at ~3 seconds per prediction used to reset the 5s window
    # on every sample, permanently suppressing incident/alarm creation.
    validator = TemporalValidator(max_gap=inference_max_gap(3, 3, 1))
    for second in [0, 9, 18]:
        assert validator.add([detection()], second) == []
    assert validator.add([detection()], 27)[0]['category'] == 'smoke'
    assert validator.add([detection()], 100) == []


def test_fast_inference_keeps_short_expiry():
    assert inference_max_gap(.1, 1, 1) == 5
    assert inference_max_gap(3, 3, 1) == 36


def test_invalid_configuration():
    with pytest.raises(ValueError):TemporalValidator(window=3,positives=4)


def test_rejects_generic_coco_classes(monkeypatch, tmp_path):
    import ultralytics
    weights=tmp_path/'generic.pt';weights.write_bytes(b'adapter-fixture')
    monkeypatch.setattr(ultralytics,'YOLO',lambda *args,**kwargs:SimpleNamespace(names={0:'person',1:'car'},task='detect'))
    with pytest.raises(ValueError,match='tidak kompatibel'):
        Detector(weights)


def test_video_loop_keeps_detection_cooldown():
    validator=TemporalValidator()
    for second in range(3):assert validator.add([detection()],second)==[]
    assert len(validator.add([detection()],3))==1
    validator.reset(clear_cooldown=False)
    for second in range(4,63):assert validator.add([detection()],second)==[]
    assert len(validator.add([detection()],63))==1
