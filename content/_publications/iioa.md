---
layout: publication
title: "Intra- and Inter-Head Orthogonal Attention for Image Captioning"
authors: "X Zhang, A Jia, J Ji, L Qu, Q Ye"
venue: "IEEE Transactions on Image Processing"
year: 2025
badge: "期刊"
pdf_url: "https://ieeexplore.ieee.org/document/10844064"
project_url: "https://ieeexplore.ieee.org/document/10844064"
citation_url: "#"
bibtex: |
  @article{zhang2025intra,
    title={Intra- and Inter-Head Orthogonal Attention for Image Captioning},
    author={Zhang, X and Jia, A and Ji, J and Qu, L and Ye, Q},
    journal={IEEE Transactions on Image Processing},
    volume={34},
    pages={1--15},
    year={2025},
    publisher={IEEE}
  }
abstract: |
  Multi-head attention (MA), which allows the model to jointly attend to crucial information from diverse representation subspaces through its heads, has yielded remarkable achievement in image captioning. However, there is no explicit mechanism to ensure MA attends to appropriate positions in diverse subspaces, resulting in overfocused attention for each head and redundancy between heads. In this paper, we propose a novel Intra- and Inter-Head Orthogonal Attention (I2OA) to efficiently improve MA in image captioning by introducing a concise orthogonal regularization to heads. Specifically, Intra-Head Orthogonal Attention enhances the attention learning of MA by introducing orthogonal constraint to each head, which decentralizes the object-centric attention to more comprehensive content-aware attention. Inter-Head Orthogonal Attention reduces the heads redundancy by applying orthogonal constraint between heads, which enlarges the diversity of representation subspaces and improves the representation ability for MA. Moreover, the proposed I2OA is flexible to combine with various multi-head attention based image captioning methods and improve the performances without increasing model complexity and parameters. Experiments on the MS COCO dataset demonstrate the effectiveness of the proposed model.
---