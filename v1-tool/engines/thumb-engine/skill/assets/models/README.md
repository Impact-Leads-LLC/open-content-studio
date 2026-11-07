# face_detection_yunet_2023mar.onnx

YuNet face detector from the OpenCV Zoo (`models/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
https://github.com/opencv/opencv_zoo), MIT License, by Shiqi Yu and contributors. Same file as the episode engine
uses (sha256 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4, 232,589 bytes).

`thumbkit/guest.py` loads it with OpenCV's `cv2.FaceDetectorYN` (`pip install opencv-python-headless`), which runs the
same on Linux, macOS and Windows. It finds faces only: the guest's face in a real frame of the episode (the call), and
the owner's face in their own photo (to place it). Nothing is generated.
